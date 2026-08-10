export type StoredDocument = Readonly<{ key: string; size: number; checksum: string }>;
export interface DocumentStorage {
  put(content: Uint8Array): Promise<StoredDocument>;
  read(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}
