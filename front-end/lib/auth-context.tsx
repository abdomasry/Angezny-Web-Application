'use client'
// ^^^ This tells Next.js: "This file uses browser features (hooks, localStorage).
// Don't try to run it on the server."
// In Next.js App Router, components are Server Components by default.
// Any component that uses useState, useEffect, onClick, etc. MUST be a Client Component.

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
// ^^^ In Next.js App Router, ALWAYS import from 'next/navigation' (NOT 'next/router').
// 'next/router' is for the old Pages Router and will NOT work here.
import { api } from './api'
import type { User } from './types'

// Step 1: Define the SHAPE of our context
// This tells TypeScript what values will be available to any component that uses useAuth()
interface AuthContextType {
  user: User | null           // The current user's data, or null if not logged in
  isLoading: boolean          // True while we're checking if the user is logged in (on page load)
  isLoggedIn: boolean         // Shortcut: true if user exists
  login: (credentials: object) => Promise<void>   // Function to log in
  signup: (userData: object) => Promise<any>       // Function to sign up (returns result so caller can check requireVerification)
  // OAuth login — `provider` is "google" | "facebook" and `payload` carries
  // the provider-issued token (e.g. { accessToken } or { idToken }).
  // Hits /auth/<provider> on the backend and seeds session storage on success.
  socialLogin: (provider: 'google' | 'facebook', payload: object) => Promise<void>
  logout: () => void          // Function to log out
  updateUser: (data: Partial<User>) => void        // Update user data in state + localStorage
}

// Step 2: Create the context with a default value
// createContext creates the "announcement system". The default value is used
// only if a component tries to use useAuth() without an AuthProvider above it.
const AuthContext = createContext<AuthContextType | null>(null)

// Step 3: Create the Provider component
// This is the "speaker" that wraps your entire app and broadcasts auth state.
// Any child component can call useAuth() to "listen" to this data.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  // --- State ---
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  // ^^^ isLoading starts as true because on first render we don't know
  // if the user is logged in yet — we need to check localStorage/API first.

  const router = useRouter()

  // --- On Mount: Restore session ---
  // useEffect runs once when the component mounts (loads for the first time).
  // We check: does the user have a saved token? If yes, restore their data.
  useEffect(() => {
    const restoreSession = async () => {
      const token = localStorage.getItem('token')

      // No token = not logged in. Stop loading.
      if (!token) {
        setIsLoading(false)
        return
      }

      // Try to restore user from localStorage first (instant, no network request)
      const savedUser = localStorage.getItem('user')
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser))
          setIsLoading(false)
          return
        } catch {
          // If JSON.parse fails (corrupted data), fall through to API call
        }
      }

      // If no saved user data, ask the server "who am I?"
      // This happens when: user has a token but user data was lost
      // (e.g., they cleared part of localStorage, or it's from before we saved user data)
      try {
        const result = await api.getWithAuth('/auth/me')
        setUser(result.user)
        localStorage.setItem('user', JSON.stringify(result.user))
      } catch {
        // Token is invalid or expired — clean up everything
        localStorage.removeItem('token')
        localStorage.removeItem('user')
      } finally {
        // Whether it succeeded or failed, we're done loading
        setIsLoading(false)
      }
    }

    restoreSession()
  }, [])
  // ^^^ The empty [] means "run this effect only once, when the component mounts"

  // --- Login function ---
  // useCallback wraps our function so it doesn't get re-created on every render.
  // This is a performance optimization — components that receive this function
  // as a prop won't re-render unnecessarily.
  const login = useCallback(async (credentials: object) => {
    const result = await api.post('/auth/signin', credentials)

    // Save both token AND user data
    localStorage.setItem('token', result.token)
    localStorage.setItem('user', JSON.stringify(result.user))

    // Update state — this triggers a re-render in EVERY component using useAuth()
    // So the Navbar will instantly switch from "Sign In" buttons to the user's avatar
    setUser(result.user)
  }, [])

  // --- Signup function ---
  const signup = useCallback(async (userData: object) => {
    const result = await api.post('/auth/signup', userData)

    localStorage.setItem('token', result.token)
    localStorage.setItem('user', JSON.stringify(result.user))
    setUser(result.user)

    // Return the full result so the signup page can check result.requireVerification
    // Email users need to verify → go to /verify-email
    // Phone users don't → go to /
    return result
  }, [])

  // --- Social login (Google / Facebook) ---
  // Mirrors `login` but hits a provider-specific endpoint. The backend
  // verifies the provider token, finds-or-creates the user, and returns
  // the same { token, user } shape as /signin.
  const socialLogin = useCallback(async (provider: 'google' | 'facebook', payload: object) => {
    const result = await api.post(`/auth/${provider}`, payload)
    localStorage.setItem('token', result.token)
    localStorage.setItem('user', JSON.stringify(result.user))
    setUser(result.user)
  }, [])

  // --- Logout function ---
  const logout = useCallback(() => {
    // Clear all auth data
    localStorage.removeItem('token')
    localStorage.removeItem('user')

    // Set user to null — Navbar will switch back to guest mode
    setUser(null)

    // Redirect to signin page using Next.js router (smooth client-side navigation)
    router.push('/signin')
  }, [router])

  // --- Update User function ---
  // This lets any component update the user's data without re-logging in.
  // Example: after editing profile, update the name so Navbar shows it immediately.
  // Partial<User> means "an object with SOME User fields" — you don't need to pass ALL fields,
  // just the ones that changed (e.g., { firstName: 'New Name' }).
  const updateUser = useCallback((updatedFields: Partial<User>) => {
    setUser(prev => {
      if (!prev) return prev  // If no user is logged in, do nothing
      const updated = { ...prev, ...updatedFields }
      // ^^^ Spread operator: copy all fields from prev, then overwrite with updatedFields.
      // Example: { id: '1', firstName: 'Old' } + { firstName: 'New' } = { id: '1', firstName: 'New' }
      localStorage.setItem('user', JSON.stringify(updated))
      // ^^^ Also save to localStorage so if user refreshes, the new data persists
      return updated
    })
  }, [])

  // Step 4: Provide the values to all children
  // Any component wrapped by AuthProvider can now call useAuth()
  // to get user, isLoading, isLoggedIn, login, signup, and logout
  return (
    <AuthContext.Provider value={{
      user,
      isLoading,
      isLoggedIn: !!user,  // !! converts to boolean: null → false, User object → true
      login,
      signup,
      socialLogin,
      logout,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

// Step 5: Create a custom hook for easy access
// Instead of writing useContext(AuthContext) everywhere, components just call useAuth()
export function useAuth() {
  const context = useContext(AuthContext)

  // Safety check: if someone tries to use useAuth() outside of AuthProvider,
  // throw a clear error instead of getting cryptic "undefined" errors
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}