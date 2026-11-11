import { useState } from "react";
import { inMemoryDb } from "../data/inMemoryDb";

const API_BASE = "http://localhost:3000";

export default function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        onLogin(data.user);
        return;
      }

      const errData = await response.json().catch(() => ({}));
      setError(errData.error || "Hibás felhasználónév vagy jelszó!");
    } catch {
      const fallbackUser = inMemoryDb.findUser(username, password);
      if (fallbackUser) {
        onLogin(fallbackUser);
      } else {
        setError("Hibás felhasználónév vagy jelszó!");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex flex-col justify-between items-center text-white px-4 py-8"
      style={{
        background:
          "linear-gradient(135deg, #275E2D 0%, #3E7B3B 50%, #528C43 100%)",
      }}
    >
      <div className="w-full max-w-md flex flex-col items-center justify-center flex-1">
        <div className="mb-4 sm:mb-6">
          <img
            src="/logo.png"
            alt="Rába ETO Logó"
            className="w-24 sm:w-28 md:w-32 h-auto object-contain drop-shadow-md"
          />
        </div>

        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-center tracking-wide mb-8 sm:mb-10 leading-snug">
          RÁBA ETO <br />
          DIGITÁLIS ESEMÉNYNAPLÓ
        </h1>

        <form onSubmit={handleSubmit} className="w-full max-w-xs space-y-5">
          <div>
            <label className="block text-sm sm:text-base font-medium mb-1">
              Felhasználónév:
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#275E2D]"
              required
            />
          </div>

          <div>
            <label className="block text-sm sm:text-base font-medium mb-1">
              Jelszó:
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded bg-white text-black focus:outline-none focus:ring-2 focus:ring-[#275E2D]"
              required
            />
          </div>

          {error && (
            <p className="text-red-300 text-sm text-center font-medium">
              {error}
            </p>
          )}

          <div className="pt-2 flex justify-center">
            <button
              type="submit"
              disabled={loading}
              className="px-8 py-2.5 rounded-xl bg-black hover:bg-neutral-800 disabled:opacity-60 text-white font-semibold shadow-md transition"
            >
              {loading ? "Bejelentkezés..." : "Bejelentkezés"}
            </button>
          </div>
        </form>
      </div>

      <footer className="text-xs sm:text-sm text-white/80 mt-8">
        © SZE Connect - Minden jog fenntartva
      </footer>
    </div>
  );
}
