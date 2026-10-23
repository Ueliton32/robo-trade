import { MacroRegime } from './macro';

(async () => {
  // Mock fetchJson by replacing the global fetch used by fetchJson
  (global as any).fetch = async (url: string) => {
    // Return a mock response for FRED
    if (url.includes('FEDFUNDS')) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          observations: [
            { value: '5.5' }
          ]
        })
      } as Response;
    }
    if (url.includes('CPIAUCSL')) {
      return {
        ok: true,
        text: async () => JSON.stringify({
          observations: [
            { value: '300' }
          ]
        })
      } as Response;
    }
    // For any other URL, return empty observations
    return {
      ok: true,
      text: async () => JSON.stringify({ observations: [] })
    } as Response;
  };

  async function testMacro() {
    const regime = new MacroRegime();
    const result = await regime.fetch();
    console.log('Macro result:', JSON.stringify(result, null, 2));
  }

  await testMacro();
})();