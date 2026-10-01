import type { Project } from './types';

export function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('footage-desk', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('project');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function loadProject(db: IDBDatabase): Promise<Project | undefined> {
  return new Promise((resolve, reject) => {
    const request = db.transaction('project').objectStore('project').get('current');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function saveProject(db: IDBDatabase, project: Project): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('project', 'readwrite');
    tx.objectStore('project').put(project, 'current');
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
  });
}
