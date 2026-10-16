export async function fetchJson(url: string): Promise<any> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const content = await response.text();
    return JSON.parse(content);
  } catch (e) {
    console.warn(`Failed to fetch ${url}:`, e);
    return null;
  }
}

export async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.text();
  } catch (e) {
    console.warn(`Failed to fetch ${url}:`, e);
    return null;
  }
}
