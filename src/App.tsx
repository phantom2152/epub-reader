import { useState } from "react";
import Library from "./components/Library";
import Reader from "./components/Reader";

function App() {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {openId ? (
        <Reader bookId={openId} onBack={() => setOpenId(null)} />
      ) : (
        <Library onOpen={setOpenId} />
      )}
    </div>
  );
}

export default App;
