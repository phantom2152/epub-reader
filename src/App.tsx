import { useState } from "react";
import Library from "./components/Library";

function App() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {openId ? (
        <div className="p-6">
          <button
            onClick={() => setOpenId(null)}
            className="mb-4 text-sm text-indigo-400"
          >
            ← Back
          </button>
          <p>Reader goes here (book id: {openId})</p>
        </div>
      ) : (
        <Library onOpen={setOpenId} />
      )}
    </div>
  );
}

export default App;
