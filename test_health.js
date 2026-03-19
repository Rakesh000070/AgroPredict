async function testHealth() {
  try {
    const response = await fetch('http://localhost:3000/api/health');
    const result = await response.json();
    console.log('Health check result:', result);
  } catch (error) {
    console.error('Health check failed:', error.message);
  }
}
testHealth();
