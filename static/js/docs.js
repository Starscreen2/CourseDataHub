async function testEndpoint(endpoint, button) {
    const responseElement = button?.closest('.endpoint-card')?.querySelector('.endpoint-response');
    if (!responseElement) return;

    try {
        const response = await fetch(endpoint);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || `Request failed (${response.status}).`);
        }
        
        // Format the JSON response
        const formattedJson = JSON.stringify(data, null, 2);
        responseElement.textContent = formattedJson;
        Prism.highlightElement(responseElement);
    } catch (error) {
        console.error('Error testing endpoint:', error);
        responseElement.textContent = JSON.stringify({ error: error.message || 'Endpoint request failed.' }, null, 2);
        Prism.highlightElement(responseElement);
    }
}

// Initialize syntax highlighting
document.addEventListener('DOMContentLoaded', () => {
    Prism.highlightAll();
});
