import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem("paws_token") || null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for session on app start
    const savedToken = localStorage.getItem("paws_token");
    if (savedToken) {
      setToken(savedToken);
      setUser({ uid: "demo-reporter-01", email: "reporter@paws.org" });
    }
    setLoading(false);
  }, []);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    if (authToken) {
      localStorage.setItem("paws_token", authToken);
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("paws_token");
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};