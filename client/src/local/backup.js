import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { snapshot, restore, BackupError } from './store';

const MAX_BYTES = 10 * 1024 * 1024;

// The history lives only on the phone, so backups are a file the person sends somewhere safe
// (Drive, WhatsApp to themselves, email) and can restore from on a new phone.

export async function exportBackup() {
  const json = JSON.stringify(snapshot());
  const name = `health-animal-backup-${new Date().toISOString().slice(0, 10)}.json`;
  if (Capacitor.isNativePlatform()) {
    const file = await Filesystem.writeFile({ path: name, data: json, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, url: file.uri, dialogTitle: name });
  } else {
    const a = document.createElement('a');
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
}

export async function importBackup(file) {
  if (file.size > MAX_BYTES) throw new BackupError('too-large', 'Backup file is too large');
  const text = await file.text();
  if (text.length > MAX_BYTES) throw new BackupError('too-large', 'Backup file is too large');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new BackupError('not-a-backup', "This file isn't a Health Animal backup");
  }
  await restore(parsed);
}
