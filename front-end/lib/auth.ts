import { api } from "./api"

export const authService = {

  signup: async (userData: object) => {
    const result = await api.post("/auth/signup", userData)
    localStorage.setItem("token", result.token)
    return result
  },

  signin: async (credentials: object) => {
    const result = await api.post("/auth/signin", credentials)
    localStorage.setItem("token", result.token)
    return result
  },

  signout: () => {
    localStorage.removeItem("token")
    window.location.href = "/signin"
  },

  getToken: () => {
    return localStorage.getItem("token")
  },

  isLoggedIn: () => {
    return !!localStorage.getItem("token") 
  }
}