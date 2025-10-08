import { GoogleGenAI, Type } from "@google/genai";

// --- DOM ELEMENT REFERENCES ---
const mainContent = document.getElementById('main-content') as HTMLElement;
const signUpNavBtn = document.getElementById('signup-nav-btn') as HTMLButtonElement;
const modalOverlay = document.getElementById('signup-modal-overlay') as HTMLDivElement;
const closeModalBtn = document.querySelector('.modal-close-btn') as HTMLButtonElement;
const signUpForm = document.getElementById('signup-form') as HTMLFormElement;

// --- STATE ---
let ai: GoogleGenAI | null = null;

// --- API & BUSINESS LOGIC ---

/**
 * Simulates fetching a roof report by calling the Gemini API.
 * @param address The property address.
 * @returns An object containing the image URL and measurement data.
 */
async function getRoofReport(address: string) {
  if (!ai) {
    ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  }

  // Define the schema for the measurement data
  const measurementSchema = {
    type: Type.OBJECT,
    properties: {
      totalArea: { type: Type.STRING, description: 'Total roof area in square feet (e.g., "2,450 sq ft")' },
      pitch: { type: Type.STRING, description: 'The primary pitch of the roof (e.g., "6/12")' },
      ridges: { type: Type.STRING, description: 'Total length of all ridges in linear feet (e.g., "120 ft")' },
      valleys: { type: Type.STRING, description: 'Total length of all valleys in linear feet (e.g., "65 ft")' },
      eaves: { type: Type.STRING, description: 'Total length of all eaves in linear feet (e.g., "180 ft")' },
      rakes: { type: Type.STRING, description: 'Total length of all rakes in linear feet (e.g., "90 ft")' },
      wasteFactor: { type: Type.STRING, description: 'Suggested waste factor percentage (e.g., "15%")' },
    },
    required: ['totalArea', 'pitch', 'ridges', 'valleys', 'eaves', 'rakes', 'wasteFactor']
  };

  // --- API Call for Measurements ---
  const measurementsPromise = ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Generate a realistic set of roof measurements for a typical single-family home at the address: ${address}.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: measurementSchema,
    },
  });

  // --- API Call for Satellite Image ---
  const imagePromise = ai.models.generateImages({
    model: 'imagen-4.0-generate-001',
    prompt: `A high-resolution, top-down satellite image of a suburban house at ${address}. The roof should be clearly visible. Sunny day, no clouds or shadows obscuring the roof.`,
    config: {
      numberOfImages: 1,
      outputMimeType: 'image/jpeg',
      aspectRatio: '1:1',
    },
  });

  // Await both promises
  const [measurementResponse, imageResponse] = await Promise.all([measurementsPromise, imagePromise]);

  // Process measurement response
  const measurements = JSON.parse(measurementResponse.text);

  // Process image response
  const base64ImageBytes = imageResponse.generatedImages[0].image.imageBytes;
  const imageUrl = `data:image/jpeg;base64,${base64ImageBytes}`;

  return { imageUrl, measurements };
}

// --- UI RENDERING FUNCTIONS ---

/**
 * Renders the initial landing page content.
 */
function renderLandingPage() {
    mainContent.innerHTML = `
      <section class="hero">
        <div class="container">
          <h1>AI-Powered Roof Reports in Minutes</h1>
          <p class="subtitle">
            Stop climbing ladders. Get precise roof measurements, material estimates, and professional reports with a single click.
          </p>
          <button class="btn btn-primary btn-large" id="signup-hero-btn">
            Get Your First Report Free
          </button>
        </div>
      </section>

      <section class="features">
        <div class="container">
          <h2>Everything a Modern Roofer Needs</h2>
          <div class="features-grid">
            <div class="feature-card">
              <h3>AI-Powered Measurements</h3>
              <p>
                Just enter an address. Our AI generates a detailed 3D model with precise measurements for area, pitch, ridges, and valleys.
              </p>
            </div>
            <div class="feature-card">
              <h3>Material Estimation</h3>
              <p>
                Automatically calculate the required materials, from shingles and underlayment to nails and waste factor. Save time and reduce errors.
              </p>
            </div>
            <div class="feature-card">
              <h3>Professional Reports</h3>
              <p>
                Generate beautiful, client-ready PDF reports with your branding, complete measurements, and a 3D view of the property.
              </p>
            </div>
          </div>
        </div>
      </section>
      
      <section class="pricing">
        <div class="container">
          <h2>Simple, Transparent Pricing</h2>
          <p class="pricing-subtitle">Choose a plan that scales with your business.</p>
          <div class="pricing-grid">
            <div class="pricing-card">
              <h3>Pay-Per-Report</h3>
              <p class="price"><span>$12</span>/report</p>
              <p class="pricing-card-description">Perfect for occasional use or getting started.</p>
              <ul>
                <li>Full Measurement Report</li>
                <li>3D Model Visualization</li>
                <li>Material Estimate</li>
                <li>Email Support</li>
              </ul>
              <button class="btn">Choose Plan</button>
            </div>
            <div class="pricing-card popular">
              <span class="popular-badge">Most Popular</span>
              <h3>Pro Monthly</h3>
              <p class="price"><span>$49</span>/month</p>
              <p class="pricing-card-description">For growing businesses that need regular reports.</p>
              <ul>
                <li><strong>20</strong> Reports/Month</li>
                <li>Full Measurement Report</li>
                <li>3D Model Visualization</li>
                <li>Material Estimate</li>
                <li>Priority Email Support</li>
              </ul>
              <button class="btn btn-primary">Choose Plan</button>
            </div>
            <div class="pricing-card">
              <h3>Business Monthly</h3>
              <p class="price"><span>$99</span>/month</p>
              <p class="pricing-card-description">Unlimited reports for high-volume contractors.</p>
              <ul>
                <li><strong>Unlimited</strong> Reports</li>
                <li>Full Measurement Report</li>
                <li>3D Model Visualization</li>
                <li>Material Estimate</li>
                <li>Phone &amp; Email Support</li>
              </ul>
              <button class="btn">Choose Plan</button>
            </div>
          </div>
        </div>
      </section>
    `;
    // Re-bind the hero button event listener since we just overwrote the HTML
    document.getElementById('signup-hero-btn')?.addEventListener('click', openModal);
}


/**
 * Renders the view for entering a property address.
 */
function renderAddressInput() {
  mainContent.innerHTML = `
    <section class="report-generator-view">
        <div class="container">
            <div class="address-form-container">
                <h1>Generate a New Roof Report</h1>
                <p>Enter the property address below to get started.</p>
                <form id="address-form">
                    <input type="text" id="address-input" placeholder="e.g., 123 Maple St, Anytown, USA" required />
                    <button type="submit" class="btn btn-primary btn-large">Get Report</button>
                </form>
            </div>
        </div>
    </section>
  `;

  document.getElementById('address-form')?.addEventListener('submit', handleAddressSubmit);
}

/**
 * Renders the loading state while the API is being called.
 */
function renderLoadingView() {
    mainContent.innerHTML = `
        <div class="loading-view">
            <div class="spinner"></div>
            <p>Fetching satellite imagery & calculating measurements...</p>
        </div>
    `;
}

/**
 * Renders the final report view with the image and measurements.
 * @param address The address for the report.
 * @param imageUrl The URL of the generated satellite image.
 * @param measurements The measurement data object.
 */
function renderReportView(address: string, imageUrl: string, measurements: Record<string, string>) {
    const measurementRows = [
        { label: 'Total Area', key: 'totalArea' },
        { label: 'Primary Pitch', key: 'pitch' },
        { label: 'Ridges', key: 'ridges' },
        { label: 'Valleys', key: 'valleys' },
        { label: 'Eaves', key: 'eaves' },
        { label: 'Rakes', key: 'rakes' },
        { label: 'Waste Factor', key: 'wasteFactor' },
    ];
    
    mainContent.innerHTML = `
        <section class="report-view">
            <div class="container">
                <div class="report-grid">
                    <div class="report-image-container">
                        <img src="${imageUrl}" alt="Satellite view of ${address}" />
                        <p>${address}</p>
                    </div>
                    <div class="report-details-container">
                        <h2>Roof Measurement Details</h2>
                        <table class="measurements-table">
                            <tbody>
                                ${measurementRows.map(row => `
                                    <tr>
                                        <td><strong>${row.label}</strong></td>
                                        <td>${measurements[row.key] || 'N/A'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="report-actions">
                    <button id="start-new-report-btn" class="btn btn-primary btn-large">Start New Report</button>
                </div>
            </div>
        </section>
    `;
    
    document.getElementById('start-new-report-btn')?.addEventListener('click', renderAddressInput);
}


// --- EVENT HANDLERS ---

/**
 * Handles the submission of the address form.
 * @param e The form submission event.
 */
async function handleAddressSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const input = form.querySelector('#address-input') as HTMLInputElement;
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    const address = input.value.trim();

    if (!address) {
        alert('Please enter a valid address.');
        return;
    }
    
    button.disabled = true;
    button.textContent = 'Generating...';
    renderLoadingView();

    try {
        const { imageUrl, measurements } = await getRoofReport(address);
        renderReportView(address, imageUrl, measurements);
    } catch (error) {
        console.error('Failed to get roof report:', error);
        alert('Sorry, we could not generate a report for that address. Please try again.');
        renderAddressInput(); // Go back to the input form on error
    }
}


// --- MODAL LOGIC ---
function openModal() {
  modalOverlay.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.classList.add('hidden');
}


// --- INITIALIZATION ---

// Event listener for the sign-up form submission
signUpForm.addEventListener('submit', (e) => {
  e.preventDefault(); 
  const nameInput = document.getElementById('full-name') as HTMLInputElement;
  const userName = nameInput.value.trim();
  
  // Store user name to persist "session"
  localStorage.setItem('contractorUserName', userName);

  closeModal();

  renderAddressInput(); // Go to the main app feature after signup
});

// Add event listeners for opening the modal
signUpNavBtn.addEventListener('click', openModal);

// Add event listeners for closing the modal
closeModalBtn.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) {
    closeModal();
  }
});

// Also close the modal with the Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalOverlay.classList.contains('hidden')) {
    closeModal();
  }
});

// Initial page load
renderLandingPage();
