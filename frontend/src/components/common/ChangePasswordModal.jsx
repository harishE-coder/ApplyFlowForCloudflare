import React, { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import api from '@/services/api';
import { KeyRound, Eye, EyeOff, AlertCircle } from 'lucide-react';

export function ChangePasswordModal({ isOpen, onClose }) {
  const { success, error: toastError } = useToast();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

  const resetForm = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
    setValidationError('');
  };

  const handleClose = () => {
    resetForm();
    onClose?.();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setValidationError('');

    if (!currentPassword) {
      setValidationError('Please enter your current password.');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setValidationError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setValidationError('New passwords do not match. Please verify.');
      return;
    }

    if (currentPassword === newPassword) {
      setValidationError('New password cannot be the same as your current password.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/auth/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
      });

      success('Password Updated', 'Your password has been changed successfully.');
      handleClose();
    } catch (err) {
      const detail = err.response?.data?.detail || 'Failed to change password. Please check your current password.';
      setValidationError(detail);
      toastError('Password Change Failed', detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Change Password"
      subtitle="Update your account login password using your current password."
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {validationError && (
          <div className="p-3 rounded-xl bg-[#FEF2F2] border border-[#FCA5A5] flex items-start gap-2 text-xs text-[#B91C1C]">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{validationError}</span>
          </div>
        )}

        {/* Current Password */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block">
            Current Password <span className="text-[#EF4444]">*</span>
          </label>
          <div className="relative">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full h-[42px] pl-3.5 pr-10 rounded-xl bg-[#F8FAFC] text-small font-medium text-[#081226] border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowCurrent(!showCurrent)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#081226] p-1"
              tabIndex={-1}
            >
              {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* New Password */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block">
            New Password <span className="text-[#EF4444]">*</span>
          </label>
          <div className="relative">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 6 characters"
              className="w-full h-[42px] pl-3.5 pr-10 rounded-xl bg-[#F8FAFC] text-small font-medium text-[#081226] border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#081226] p-1"
              tabIndex={-1}
            >
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {newPassword && (
            <p className={`text-[11px] font-semibold ${newPassword.length >= 6 ? 'text-[#16A34A]' : 'text-[#EF4444]'}`}>
              {newPassword.length >= 6 ? '✓ Minimum length satisfied' : 'Must be at least 6 characters'}
            </p>
          )}
        </div>

        {/* Confirm New Password */}
        <div className="space-y-1">
          <label className="text-[11px] font-bold uppercase tracking-wider text-[#64748B] block">
            Confirm New Password <span className="text-[#EF4444]">*</span>
          </label>
          <div className="relative">
            <input
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full h-[42px] pl-3.5 pr-10 rounded-xl bg-[#F8FAFC] text-small font-medium text-[#081226] border border-[#E2E8F0] focus:outline-none focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/15"
              autoComplete="new-password"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#94A3B8] hover:text-[#081226] p-1"
              tabIndex={-1}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmPassword && newPassword && (
            <p className={`text-[11px] font-semibold ${newPassword === confirmPassword ? 'text-[#16A34A]' : 'text-[#EF4444]'}`}>
              {newPassword === confirmPassword ? '✓ Passwords match' : 'Passwords do not match'}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#F1F5F9]">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            variant="primary"
            icon={KeyRound}
            isLoading={loading}
          >
            Update Password
          </Button>
        </div>
      </form>
    </Modal>
  );
}
