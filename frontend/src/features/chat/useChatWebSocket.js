import { useEffect, useRef, useState, useCallback } from 'react';
import api, { getWebSocketUrl } from '@/services/api';

/**
 * Production-grade hook for managing real-time WebSocket connection to a chat room.
 * Resolves API/WS endpoints across local dev, Vite proxies, and deployed environments.
 * Authenticates via JWT token query param and cookies for 100% reliable cross-origin connections.
 * Features exponential backoff with ±20% jitter and full message lifecycle support.
 */
export function useChatWebSocket(roomId, callbacks = {}) {
  const callbacksRef = useRef(callbacks);
  useEffect(() => {
    callbacksRef.current = callbacks;
  }, [callbacks]);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const isManuallyClosedRef = useRef(false);
  const typingTimersRef = useRef({});
  const lastMessageIdRef = useRef(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState({});

  useEffect(() => {
    lastMessageIdRef.current = null;
    if (!roomId) {
      setIsConnected(false);
      setIsReconnecting(false);
      setOnlineUsers([]);
      setTypingUsers({});
      return;
    }

    isManuallyClosedRef.current = false;
    reconnectAttemptsRef.current = 0;

    async function connect() {
      if (isManuallyClosedRef.current) return;

      // Clean up existing socket
      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.close();
        } catch {
          // ignore
        }
      }

      if (isManuallyClosedRef.current) return;

      const baseWsUrl = getWebSocketUrl(`/ws/chat/${roomId}`);
      const separator = baseWsUrl.includes('?') ? '&' : '?';
      const wsUrl = lastMessageIdRef.current
        ? `${baseWsUrl}${separator}last_message_id=${encodeURIComponent(lastMessageIdRef.current)}`
        : baseWsUrl;
      let pingInterval = null;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsConnected(true);
          setIsReconnecting(false);
          reconnectAttemptsRef.current = 0;
          callbacksRef.current.onOpen?.();

          // Request replay of any messages missed while disconnected
          if (lastMessageIdRef.current) {
            ws.send(JSON.stringify({ type: 'sync', last_message_id: lastMessageIdRef.current }));
          }

          // 30s Presence Heartbeat
          clearInterval(pingInterval);
          pingInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000);
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === 'pong') {
              // Heartbeat ack
              return;
            } else if (data.type === 'new_message') {
              if (data.message?.id) {
                lastMessageIdRef.current = data.message.id;
              }
              callbacksRef.current.onMessage?.(data.message);
            } else if (data.type === 'room_update') {
              callbacksRef.current.onRoomUpdate?.(data);
            } else if (data.type === 'message_status') {
              callbacksRef.current.onMessageStatus?.(data);
            } else if (data.type === 'typing') {
              const uid = data.user_id;
              const uName = data.user_name || 'Someone';

              // Clear any existing timer for this user
              if (typingTimersRef.current[uid]) {
                clearTimeout(typingTimersRef.current[uid]);
                delete typingTimersRef.current[uid];
              }

              if (data.is_typing) {
                setTypingUsers((prev) => ({ ...prev, [uid]: uName }));

                // Auto-clear typing indicator after 2.5 seconds if no updates
                typingTimersRef.current[uid] = setTimeout(() => {
                  setTypingUsers((prev) => {
                    const next = { ...prev };
                    delete next[uid];
                    return next;
                  });
                  delete typingTimersRef.current[uid];
                }, 2500);
              } else {
                setTypingUsers((prev) => {
                  const next = { ...prev };
                  delete next[uid];
                  return next;
                });
              }

              callbacksRef.current.onTyping?.(data);
            } else if (data.type === 'read_receipt') {
              callbacksRef.current.onReadReceipt?.(data);
            } else if (data.type === 'presence') {
              if (data.online_users) {
                setOnlineUsers(data.online_users);
              }
              callbacksRef.current.onPresence?.(data);
            } else if (data.type === 'message_deleted') {
              callbacksRef.current.onMessageDeleted?.(data);
            } else if (data.type === 'room_status_changed') {
              callbacksRef.current.onRoomStatusChanged?.(data);
            }
          } catch (err) {
            console.error('Error parsing WS message:', err);
          }
        };

        ws.onclose = (event) => {
          clearInterval(pingInterval);
          setIsConnected(false);
          // Do not reconnect on intentional close or unmount
          if (!isManuallyClosedRef.current && event.code !== 4003 && roomId) {
            setIsReconnecting(true);
            const attempt = reconnectAttemptsRef.current;
            const baseDelay = Math.min(1000 * Math.pow(2, attempt), 20000);
            const jitter = (Math.random() * 0.4 - 0.2) * baseDelay; // ±20% jitter
            const delay = Math.max(500, Math.round(baseDelay + jitter));

            reconnectAttemptsRef.current += 1;
            reconnectTimeoutRef.current = setTimeout(() => {
              connect();
            }, delay);
          }
        };

        ws.onerror = () => {
          clearInterval(pingInterval);
          setIsConnected(false);
        };
      } catch (err) {
        clearInterval(pingInterval);
        console.error('WS Connection error:', err);
      }
    }

    connect();

    return () => {
      isManuallyClosedRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      Object.values(typingTimersRef.current).forEach((t) => clearTimeout(t));
      typingTimersRef.current = {};

      if (wsRef.current) {
        try {
          wsRef.current.onclose = null;
          wsRef.current.onerror = null;
          wsRef.current.close();
        } catch {
          // ignore
        }
      }
      setTypingUsers({});
      setIsConnected(false);
      setIsReconnecting(false);
    };
  }, [roomId]);

  // Send helpers
  const sendMessage = useCallback((text, clientId = null) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'message', text, client_id: clientId }));
      return true;
    }
    return false;
  }, []);

  const sendTyping = useCallback((isTyping) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'typing', is_typing: isTyping }));
    }
  }, []);

  const sendRead = useCallback((messageId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'read', message_id: messageId }));
    }
  }, []);

  const sendDeliveryAck = useCallback((messageId) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'delivery_ack', message_id: messageId }));
    }
  }, []);

  return {
    isConnected,
    isReconnecting,
    onlineUsers,
    typingUsers,
    sendMessage,
    sendTyping,
    sendRead,
    sendDeliveryAck,
  };
}


