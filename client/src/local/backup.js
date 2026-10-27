import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { snapshot, restore } from './store';

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
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = name;
    a.click();
  }
}

export async function importBackup(file) {
  const text = await file.text();
  await restore(JSON.parse(text));
}
