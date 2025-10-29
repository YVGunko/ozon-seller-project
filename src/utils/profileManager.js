export class ProfileManager {
  static getProfiles() {
    if (typeof window === 'undefined') return [];
    return JSON.parse(localStorage.getItem('ozonProfiles') || '[]');
  }

  static getCurrentProfile() {
    if (typeof window === 'undefined') return null;
    return JSON.parse(localStorage.getItem('currentOzonProfile') || 'null');
  }

  static saveProfiles(profiles) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('ozonProfiles', JSON.stringify(profiles));
  }

  static setCurrentProfile(profile) {
    if (typeof window === 'undefined') return;
    localStorage.setItem('currentOzonProfile', JSON.stringify(profile));
  }

  static exportProfiles() {
    const profiles = this.getProfiles();
    const dataStr = JSON.stringify(profiles, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = 'ozon-profiles-backup.json';
    link.click();
  }

  static importProfiles(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const profiles = JSON.parse(e.target.result);
          this.saveProfiles(profiles);
          resolve(profiles);
        } catch (error) {
          reject(new Error('Invalid file format'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }
}