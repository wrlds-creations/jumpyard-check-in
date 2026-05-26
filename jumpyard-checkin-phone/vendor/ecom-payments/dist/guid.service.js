class GuidService {
    generate() {
        if (crypto && typeof crypto.randomUUID === 'function') {
            try {
                return crypto.randomUUID();
            }
            catch (err) { }
        }
        const selfGenerateGuid = () => {
            // crypto.getRandomValues is stronger than Math.random --> use when available
            if (crypto && typeof crypto.getRandomValues === 'function') {
                try {
                    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => {
                        const n = Number.parseInt(c);
                        const v = n ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (n / 4)));
                        return v.toString(16);
                    });
                }
                catch (err) { }
            }
            // POS version
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                const r = (Math.random() * 16) | 0;
                const v = c === 'x' ? r : (r & 0x3) | 0x8;
                return v.toString(16);
            });
        };
        let generatedGuid = undefined;
        let attempts = 0;
        while (attempts < 10) {
            generatedGuid = selfGenerateGuid();
            if (GuidService.alreadyGenerated.indexOf(generatedGuid) === -1) {
                GuidService.alreadyGenerated.push(generatedGuid);
                break;
            }
            attempts++;
        }
        return generatedGuid;
    }
}
GuidService.alreadyGenerated = [];
export { GuidService };
