import { useEffect, useState } from "react";
import Library from "./components/Library";
import Reader from "./components/Reader";
import DownloadTray from "./components/DownloadTray";

function parseHash(): string | null {
  const m = location.hash.match(/^#\/book\/(.+)$/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return null;
  }
}

// counts in-app navigations, so "← Library" can use real history when it makes sense
let inAppNavs = 0;

function App() {
  const [bookId, setBookId] = useState<string | null>(parseHash);

  useEffect(() => {
    const onHash = () => setBookId(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  function openBook(id: string) {
    inAppNavs += 1;
    location.hash = `/book/${encodeURIComponent(id)}`;
  }

  function bookMissing() {
    // replace (not push), so the broken link doesn't stay in history
    location.replace("#/");
  }

  function goLibrary() {
    if (inAppNavs > 0) {
      // we came from the library, so go back (keeps history clean)
      inAppNavs -= 1;
      history.back();
    } else {
      // page was loaded straight onto a book (refresh / bookmark)
      location.replace("#/");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {bookId ? (
        <Reader
          key={bookId}
          bookId={bookId}
          onBack={goLibrary}
          onMissing={bookMissing}
        />
      ) : (
        <Library onOpen={openBook} />
      )}
      <DownloadTray />
    </div>
  );
}

export default App;
