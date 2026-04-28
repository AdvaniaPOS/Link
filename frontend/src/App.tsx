import { Link } from "react-router-dom";

export default function App() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <div className="max-w-xl text-center space-y-4">
        <h1 className="text-3xl font-bold text-slate-900">Tagly</h1>
        <p className="text-slate-600">
          Multi-tenant Digital Product Pass. Skann en QR-kode for å åpne et produktpass.
        </p>
        <Link
          to="/admin"
          className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-5 py-2.5 rounded-md"
        >
          Åpne admin-portalen →
        </Link>
      </div>
    </main>
  );
}
