import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import {
  Lock,
  Mail,
  ArrowRight,
  CheckCircle2,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { ApplyFlowLogo } from '@/assets/logo/ApplyFlowLogo';
import { LoginBrandIllustration } from '@/assets/illustrations/ATSIllustrations';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from './AuthContext';
import { useToast } from '@/components/ui/Toast';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { success, error: toastError } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (data) => {
    setIsLoading(true);
    setAuthError('');
    try {
      const user = await login(data.email, data.password);
      success('Welcome back', `Signed in as ${user?.name || 'User'}`);
      navigate('/dashboard');
    } catch (err) {
      const status = err?.response?.status;
      const resData = err?.response?.data;

      let msg = 'Invalid email or password';

      if (status === 401) {
        msg = 'Invalid email or password';
      } else if (status === 403) {
        msg = 'Account is disabled. Please contact an administrator.';
      } else {
        const rawDetail =
          resData?.detail ??
          resData?.message ??
          resData?.error ??
          err?.message ??
          '';

        if (typeof rawDetail === 'string' && rawDetail.trim()) {
          msg = rawDetail.trim();
        } else if (Array.isArray(rawDetail)) {
          msg = rawDetail
            .map((d) => {
              if (typeof d === 'string') return d;
              if (d && typeof d === 'object') return d.msg || d.message || JSON.stringify(d);
              return String(d);
            })
            .filter(Boolean)
            .join('; ') || 'Invalid email or password';
        } else if (rawDetail && typeof rawDetail === 'object') {
          msg = rawDetail.msg || rawDetail.message || rawDetail.error || JSON.stringify(rawDetail);
        } else if (rawDetail) {
          msg = String(rawDetail);
        }
      }

      setAuthError(msg);
      toastError('Authentication Failed', msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex bg-[#F6F8FB]">
      {/* LEFT 40%: Branding Showcase */}
      <div className="hidden lg:flex lg:w-[42%] bg-[#081226] p-12 flex-col justify-between relative overflow-hidden border-r border-[#1E2E4E]">
        {/* Ambient background glow */}
        <div className="absolute -top-32 -left-32 w-96 h-96 rounded-full bg-[#2563EB]/15 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 rounded-full bg-[#F97316]/10 blur-3xl pointer-events-none" />

        {/* Brand Header */}
        <div className="relative z-10">
          <ApplyFlowLogo variant="dark" />
        </div>

        {/* Middle Visual & Value Prop */}
        <div className="relative z-10 my-auto py-8">
          <div className="mb-8">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#2563EB]/20 border border-[#2563EB]/30 text-caption font-semibold text-[#60A5FA] mb-4">
              <Zap className="w-3.5 h-3.5 text-[#F97316]" />
              Enterprise Recruitment ATS
            </span>

            <h1 className="text-display font-extrabold text-white tracking-tight leading-tight">
              Recruitment operations at scale.
            </h1>

            <p className="text-body text-[#94A3B8] mt-3 max-w-md leading-relaxed">
              Precision candidate parsing, live pipeline orchestration, client delivery tracking, and performance targets in one unified workspace.
            </p>
          </div>

          <div className="my-6">
            <LoginBrandIllustration className="w-full max-w-[380px]" />
          </div>

          {/* Key Feature Bullets */}
          <div className="space-y-3 pt-4 border-t border-[#1E2E4E]">
            <div className="flex items-center gap-3 text-small text-[#CBD5E1]">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
              <span>Multi-client candidate isolation and permission scoping</span>
            </div>
            <div className="flex items-center gap-3 text-small text-[#CBD5E1]">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
              <span>Instant batch resume ingestion & duplicate detection</span>
            </div>
            <div className="flex items-center gap-3 text-small text-[#CBD5E1]">
              <CheckCircle2 className="w-4 h-4 text-[#16A34A] shrink-0" />
              <span>Permanent split-view candidate review & workflow tracking</span>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="relative z-10 flex items-center justify-between text-caption text-[#64748B] pt-4 border-t border-[#101F3D]">
          <span>ApplyFlow ATS</span>
          <span>Enterprise Edition</span>
        </div>
      </div>

      {/* RIGHT 60%: High-Precision Production Login Form */}
      <div className="flex-1 flex flex-col justify-center items-center p-6 sm:p-12 md:p-16 lg:p-20 overflow-y-auto">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="w-full max-w-[480px] bg-white rounded-3xl border border-[#E2E8F0] shadow-card p-8 sm:p-10"
        >
          {/* Mobile Logo */}
          <div className="lg:hidden mb-8">
            <ApplyFlowLogo variant="light" />
          </div>

          <div className="mb-8">
            <h2 className="text-h1 font-extrabold text-[#081226] tracking-tight">
              Sign in to workspace
            </h2>
            <p className="text-small text-[#64748B] mt-1.5">
              Enter your corporate credentials to access your candidate pipelines.
            </p>
          </div>

          {authError && (
            <div className="mb-6 p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#EF4444] text-small font-medium flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 shrink-0" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <Input
              label="Work Email Address"
              type="email"
              placeholder="name@company.com"
              icon={Mail}
              required
              error={errors.email?.message}
              {...register('email', {
                required: 'Work email is required',
                pattern: {
                  value: /^\S+@\S+$/i,
                  message: 'Invalid email address',
                },
              })}
            />

            <Input
              label="Password"
              type="password"
              placeholder="••••••••••••"
              icon={Lock}
              required
              error={errors.password?.message}
              {...register('password', {
                required: 'Password is required',
                minLength: {
                  value: 6,
                  message: 'Password must be at least 6 characters',
                },
              })}
            />

            <div className="pt-2">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                isLoading={isLoading}
                icon={ArrowRight}
                iconPosition="right"
                className="w-full h-[48px] text-body font-bold"
              >
                Sign In to ApplyFlow
              </Button>
            </div>
          </form>
        </motion.div>
      </div>
    </div>
  );
}

export default LoginPage;
