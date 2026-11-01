import ePub from "epubjs";

export async function readMetadata(data: ArrayBuffer) {
  const book = ePub(data);
  try {
    const meta = await book.loaded.metadata;
    let cover: Blob | null = null;
    try {
      const url = await book.coverUrl();
      if (url) cover = await (await fetch(url)).blob();
    } catch {
      // some books have no usable cover, that's fine
    }
    return {
      title: meta.title || "Untitled",
      author: meta.creator || "Unknown author",
      cover,
    };
  } finally {
    book.destroy();
  }
}
