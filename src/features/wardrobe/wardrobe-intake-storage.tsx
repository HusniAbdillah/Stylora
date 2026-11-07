"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui";
import { wardrobePreviewStore } from "./wardrobe-preview";
import { wardrobeIntakeDraftStore } from "./wardrobe-intake-draft";

const databaseName = "stylora-preview-wardrobe-photos";
const objectStoreName = "photos";
const maxPhotoBytes = 10 * 1024 * 1024;
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function photoDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("Photo storage is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(objectStoreName)) {
        request.result.createObjectStore(objectStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("Photo storage could not be opened."));
    request.onblocked = () =>
      reject(new Error("Photo storage is busy. Close other tabs and retry."));
  });
}

async function transact<T>(
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await photoDatabase();
  return new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(objectStoreName, mode);
    const request = operation(transaction.objectStore(objectStoreName));
    let value: T;
    request.onsuccess = () => {
      value = request.result;
    };
    request.onerror = () =>
      reject(
        new Error("Photo storage failed. Check browser storage and retry."),
      );
    transaction.oncomplete = () => {
      database.close();
      resolve(value);
    };
    transaction.onerror = () => {
      database.close();
      reject(
        new Error("Photo storage failed. Check browser storage and retry."),
      );
    };
    transaction.onabort = () => {
      database.close();
      reject(new Error("Photo storage is full or unavailable."));
    };
  });
}

function hasMatchingSignature(bytes: Uint8Array, type: string) {
  if (type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (byte, index) => bytes[index] === byte,
    );
  }
  return (
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  );
}

export async function validateWardrobePhoto(file: File): Promise<void> {
  if (!allowedTypes.has(file.type)) {
    throw new Error("Choose a JPEG, PNG or WebP photo.");
  }
  if (file.size === 0 || file.size > maxPhotoBytes) {
    throw new Error("Choose a photo smaller than 10 MB.");
  }
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (!hasMatchingSignature(bytes, file.type)) {
    throw new Error(
      "The selected file is not a valid image of its stated type.",
    );
  }
  try {
    const bitmap = await createImageBitmap(file);
    const valid =
      bitmap.width >= 64 &&
      bitmap.height >= 64 &&
      bitmap.width <= 10000 &&
      bitmap.height <= 10000;
    bitmap.close();
    if (!valid)
      throw new Error("Choose a photo between 64 and 10,000 pixels per side.");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Choose a photo"))
      throw error;
    throw new Error("This photo could not be opened. Choose another image.");
  }
}

export async function saveWardrobePhoto(file: File): Promise<string> {
  await validateWardrobePhoto(file);
  const key = crypto.randomUUID();
  await transact("readwrite", (store) => store.put(file, key));
  return key;
}

export async function readWardrobePhoto(
  key: string,
): Promise<Blob | undefined> {
  return transact("readonly", (store) => store.get(key));
}

export async function deleteWardrobePhoto(key: string): Promise<void> {
  await transact("readwrite", (store) => store.delete(key));
}

export async function deleteWardrobePhotoIfUnused(
  key: string,
): Promise<boolean> {
  try {
    void window.localStorage.length;
  } catch {
    return false;
  }
  if (wardrobeIntakeDraftStore.get().imageKey === key) return false;
  if (wardrobePreviewStore.get().some((record) => record.imageKey === key))
    return false;
  await deleteWardrobePhoto(key);
  return true;
}

export function WardrobePreviewImage({
  imageKey,
  fallbackUrl,
  alt,
  className,
  retryable = false,
}: {
  imageKey?: string;
  fallbackUrl?: string | null;
  alt: string;
  className?: string;
  retryable?: boolean;
}) {
  const [retry, setRetry] = useState(0);
  const [resolved, setResolved] = useState<{
    key: string;
    retry: number;
    url: string | null;
    failed: boolean;
  } | null>(null);
  const [failedStaticUrl, setFailedStaticUrl] = useState<string | null>(null);
  const current =
    imageKey && resolved?.key === imageKey && resolved.retry === retry
      ? resolved
      : null;
  const source = imageKey
    ? (current?.url ?? null)
    : fallbackUrl && fallbackUrl !== failedStaticUrl
      ? fallbackUrl
      : null;
  const failed = imageKey
    ? (current?.failed ?? false)
    : Boolean(fallbackUrl && fallbackUrl === failedStaticUrl);

  useEffect(() => {
    if (!imageKey) return;
    let active = true;
    let objectUrl: string | undefined;
    readWardrobePhoto(imageKey)
      .then((photo) => {
        if (!active) return;
        if (!photo) {
          setResolved({
            key: imageKey,
            retry,
            url: fallbackUrl || null,
            failed: true,
          });
          return;
        }
        objectUrl = URL.createObjectURL(photo);
        setResolved({ key: imageKey, retry, url: objectUrl, failed: false });
      })
      .catch(() => {
        if (active) {
          setResolved({
            key: imageKey,
            retry,
            url: fallbackUrl || null,
            failed: true,
          });
        }
      });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageKey, fallbackUrl, retry]);

  if (source) {
    return (
      <img
        className={className}
        src={source}
        alt={alt}
        onError={() => {
          if (imageKey)
            setResolved({ key: imageKey, retry, url: null, failed: true });
          else setFailedStaticUrl(fallbackUrl || null);
        }}
      />
    );
  }
  return (
    <span
      className={className}
      role="img"
      aria-label={alt || "Image unavailable"}
    >
      <Icon name="image" size={28} />
      <span>
        {failed ? "Image unavailable" : imageKey ? "Loading photo" : "No photo"}
      </span>
      {failed && retryable && (
        <button type="button" onClick={() => setRetry((value) => value + 1)}>
          Retry photo
        </button>
      )}
    </span>
  );
}
