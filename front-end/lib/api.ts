// Read from env so prod points at the real API. Falls back to localhost for dev.

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

export const api = {

    // Public GET — no auth token needed
    // Used for public endpoints like /categories and /workers
    get: async (endpoint: string) => {
      const response = await fetch(`${BASE_URL}${endpoint}`, {
        method: "GET",
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Something went wrong");
      }

      return result;
    },

    post: async(endpoint: string, data: object) => {
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        });
        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message || "something went wrong");
        }

        return result;
    },
    
    postWithAuth: async (endpoint: string, data: object) => {
    const token = localStorage.getItem("token")

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message || "Something went wrong")
    }

    return result
  },

    // GET request with auth token — used for reading protected data (like /me)
    // Same as postWithAuth but without a body (GET requests don't send data)
    getWithAuth: async (endpoint: string) => {
    const token = localStorage.getItem("token")

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message || "Something went wrong")
    }

    return result
  },

    // PUT request with auth token — used for UPDATING existing data (like profile)
    // PUT = "replace/update this resource" vs POST = "create a new resource"
    putWithAuth: async (endpoint: string, data: object) => {
    const token = localStorage.getItem("token")

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message || "Something went wrong")
    }

    return result
  },

    // DELETE request with auth token — used for REMOVING a resource (like a saved card)
    // DELETE = "remove this resource from the server"
    // No body needed: the resource ID is part of the URL (e.g. /payment-methods/abc123)
    deleteWithAuth: async (endpoint: string) => {
    const token = localStorage.getItem("token")

    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.message || "Something went wrong")
    }

    return result
  },
};