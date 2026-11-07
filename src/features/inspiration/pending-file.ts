function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("stylora-create-files", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("File recovery is unavailable in this browser."));
  });
}

export async function retainPendingFile(scope: string, file: File | null) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("files", "readwrite");
      const store = transaction.objectStore("files");
      if (file) store.put(file, scope);
      else store.delete(scope);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

export async function restorePendingFile(scope: string) {
  const db = await database();
  try {
    return await new Promise<File | null>((resolve, reject) => {
      const request = db.transaction("files").objectStore("files").get(scope);
      request.onsuccess = () =>
        resolve(request.result instanceof File ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}
