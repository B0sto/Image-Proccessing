'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormik } from 'formik';
import { useState } from 'react';
import {
  useAuth,
  validateEmail,
  validatePassword,
  validateUsername,
} from '@/hooks/useAuth';

interface RegisterValues {
  username: string;
  email: string;
  password: string;
}

export default function RegisterPage() {
  const router = useRouter();
  const { signUp, isLoading } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);

  const formik = useFormik<RegisterValues>({
    initialValues: {
      username: '',
      email: '',
      password: '',
    },
    validate: (values) => {
      const errors: Partial<Record<keyof RegisterValues, string>> = {};

      const usernameError = validateUsername(values.username);
      if (usernameError) {
        errors.username = usernameError;
      }

      const emailError = validateEmail(values.email);
      if (emailError) {
        errors.email = emailError;
      }

      const passwordError = validatePassword(values.password);
      if (passwordError) {
        errors.password = passwordError;
      }

      return errors;
    },
    onSubmit: async (values) => {
      setSubmitError(null);
      setSubmitSuccess(null);

      const result = await signUp(values);
      if (!result.ok) {
        setSubmitError(result.message ?? 'Registration failed.');
        return;
      }

      setSubmitSuccess(result.message ?? 'Account created successfully.');
      router.push('/login');
    },
  });

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -left-20 top-14 h-72 w-72 rounded-full bg-sky-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-10 h-80 w-80 rounded-full bg-indigo-300/35 blur-3xl" />
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md items-center">
        <section className="w-full rounded-3xl border border-sky-200/70 bg-white/90 p-8 shadow-[0_24px_55px_-35px_rgba(30,64,175,0.55)] backdrop-blur">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Cloud Studio</p>
          <h1 className="mt-1 text-3xl font-semibold text-slate-900">Create account</h1>
          <p className="mt-2 text-sm text-slate-600">Start uploading and transforming your images.</p>

          <form className="mt-6 space-y-4" onSubmit={formik.handleSubmit} noValidate>
            <div>
              <label htmlFor="username" className="mb-1 block text-sm font-medium text-slate-700">
                Username
              </label>
              <input
                id="username"
                name="username"
                type="text"
                value={formik.values.username}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Choose a username"
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
              {formik.touched.username && formik.errors.username ? (
                <p className="mt-1 text-xs text-red-600">{formik.errors.username}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                value={formik.values.email}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Enter your email"
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
              {formik.touched.email && formik.errors.email ? (
                <p className="mt-1 text-xs text-red-600">{formik.errors.email}</p>
              ) : null}
            </div>

            <div>
              <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                value={formik.values.password}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                placeholder="Create a password"
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
              {formik.touched.password && formik.errors.password ? (
                <p className="mt-1 text-xs text-red-600">{formik.errors.password}</p>
              ) : null}
            </div>

            {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}
            {submitSuccess ? <p className="text-sm text-green-700">{submitSuccess}</p> : null}

            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:from-sky-700 hover:to-blue-800"
            >
              {isLoading ? 'Creating account...' : 'Register'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-slate-900 hover:underline">
              Sign in
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
