'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useFormik } from 'formik';
import { useState } from 'react';
import { useAuth, validatePassword, validateUsername } from '@/hooks/useAuth';

interface LoginValues {
  username: string;
  password: string;
}

export default function LoginPage() {
  const router = useRouter();
  const { signIn, isLoading } = useAuth();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const formik = useFormik<LoginValues>({
    initialValues: {
      username: '',
      password: '',
    },
    validate: (values) => {
      const errors: Partial<Record<keyof LoginValues, string>> = {};

      const usernameError = validateUsername(values.username);
      if (usernameError) {
        errors.username = usernameError;
      }

      const passwordError = validatePassword(values.password);
      if (passwordError) {
        errors.password = passwordError;
      }

      return errors;
    },
    onSubmit: async (values) => {
      setSubmitError(null);
      const result = await signIn(values);

      if (!result.ok) {
        setSubmitError(result.message ?? 'Sign in failed.');
        return;
      }

      router.push('/');
    },
  });

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-6 sm:py-10">
      <div className="pointer-events-none absolute -left-20 top-14 h-72 w-72 rounded-full bg-sky-300/35 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 top-10 h-80 w-80 rounded-full bg-indigo-300/35 blur-3xl" />
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-md items-center sm:min-h-[calc(100vh-5rem)]">
        <section className="w-full rounded-3xl border border-sky-200/70 bg-white/90 p-6 shadow-[0_24px_55px_-35px_rgba(30,64,175,0.55)] backdrop-blur sm:p-8">
          <p className="text-xs uppercase tracking-[0.2em] text-sky-600">Cloud Studio</p>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">Sign in</h1>
          <p className="mt-2 text-sm text-slate-600">Access your account to manage image transformations.</p>

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
                placeholder="Enter your username"
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
              {formik.touched.username && formik.errors.username ? (
                <p className="mt-1 text-xs text-red-600">{formik.errors.username}</p>
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
                placeholder="Enter your password"
                className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-200"
              />
              {formik.touched.password && formik.errors.password ? (
                <p className="mt-1 text-xs text-red-600">{formik.errors.password}</p>
              ) : null}
            </div>

            {submitError ? <p className="text-sm text-red-600">{submitError}</p> : null}

            <button
              type="submit"
              className="mt-2 w-full rounded-xl bg-gradient-to-r from-sky-600 to-blue-700 px-4 py-2 text-sm font-semibold text-white transition hover:from-sky-700 hover:to-blue-800"
            >
              {isLoading ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-slate-600">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="font-medium text-slate-900 hover:underline">
              Register
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
