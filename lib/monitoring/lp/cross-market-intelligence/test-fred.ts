async function testFred() {
  const url = 'https://api.stlouisfed.org/fred/series/observations?series_id=FEDFUNDS&api_key=demo&file_type=json&limit=1&sort_order=desc';
  try {
    const response = await fetch(url);
    if (!response.ok) {
      console.log(`HTTP ${response.status}`);
      return;
    }
    const data = await response.json();
    console.log(data);
  } catch (e) {
    console.error(e);
  }
}

testFred();