const DB_NAME = 'AethelgardDB';
const DB_VERSION = 1;
const STORE_NAME = 'pdf_cache';

export interface CachedPdf {
  bookId: string;
  filename: string;
  data: ArrayBuffer;
}

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (_e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

export async function savePdfToDb(bookId: string, filename: string, data: ArrayBuffer): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    // Store with id 'active_pdf' to keep exactly one cached document at any time
    const request = store.put({ id: 'active_pdf', bookId, filename, data });

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getPdfFromDb(): Promise<CachedPdf | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.get('active_pdf');

    request.onsuccess = () => {
      if (request.result) {
        resolve({
          bookId: request.result.bookId ?? `upload:${request.result.filename}`,
          filename: request.result.filename,
          data: request.result.data
        });
      } else {
        resolve(null);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

export async function clearPdfFromDb(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete('active_pdf');

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
