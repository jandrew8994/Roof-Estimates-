import { GoogleGenAI, Type } from "@google/genai";

// --- TYPE DECLARATIONS FOR CDN LIBRARIES ---
declare const html2canvas: any;
declare global {
    interface Window {
        jspdf: any;
    }
}


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
 * Creates a simple 2D SVG visualization of the roof.
 * @param measurements The measurement data object.
 * @returns An SVG string.
 */
function createRoofVisualizationSVG(measurements: Record<string, string>): string {
    // Parse numeric values from measurement strings, providing defaults if parsing fails
    const ridgeLength = parseFloat(measurements.ridges) || 100;
    // Assuming eaves length is for two sides of a simple gable roof
    const roofDepth = (parseFloat(measurements.eaves) || 200) / 2;
    const pitchParts = (measurements.pitch || '6/12').split('/').map(p => parseFloat(p));
    const rise = pitchParts[0] || 6;
    const run = pitchParts[1] || 12;

    // Define dimensions for the SVG elements
    const svgWidth = 400;
    const svgHeight = 250;
    
    // Top-down view dimensions
    const rectWidth = 200;
    const rectHeight = (roofDepth / ridgeLength) * rectWidth; // Maintain aspect ratio
    const rectX = 30;
    const rectY = 60;
    
    // Pitch triangle view dimensions
    const triBase = 100;
    const triHeight = (rise / run) * triBase;
    const triX = 270;
    const triY = rectY + rectHeight; // Align bottom of triangle with bottom of rect
    
    const textStyle = `font-family: var(--body-font); font-size: 12px; fill: #4a5568;`;
    const dimensionStyle = `font-family: var(--body-font); font-size: 14px; font-weight: 600; fill: #1a202c;`;
    const shapeStyle = `fill: #e2e8f0; stroke: #a0aec0; stroke-width: 1.5;`;

    return `
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" aria-labelledby="visTitle" role="img">
        <title id="visTitle">2D Roof Diagram</title>
        
        <text x="${svgWidth / 2}" y="25" text-anchor="middle" style="${dimensionStyle.replace('14px', '16px')}">Roof Diagram</text>

        <!-- Top-Down View -->
        <text x="${rectX + rectWidth / 2}" y="${rectY - 10}" text-anchor="middle" style="${textStyle}">Top-Down View</text>
        <rect x="${rectX}" y="${rectY}" width="${rectWidth}" height="${rectHeight}" style="${shapeStyle}" rx="4" />
        <text x="${rectX + rectWidth / 2}" y="${rectY + rectHeight + 20}" text-anchor="middle" style="${dimensionStyle}">${ridgeLength} ft (Ridge)</text>
        <text x="${rectX - 10}" y="${rectY + rectHeight / 2}" text-anchor="end" dominant-baseline="middle" style="${dimensionStyle}" transform="rotate(-90, ${rectX - 10}, ${rectY + rectHeight / 2})">${roofDepth.toFixed(1)} ft</text>

        <!-- Pitch View -->
        <text x="${triX + triBase / 2}" y="${rectY - 10}" text-anchor="middle" style="${textStyle}">Pitch: ${rise}/${run}</text>
        <polygon points="${triX},${triY} ${triX + triBase},${triY} ${triX + triBase},${triY - triHeight}" style="${shapeStyle}" />
        <line x1="${triX}" y1="${triY}" x2="${triX + triBase}" y2="${triY}" stroke="#4a5568" stroke-dasharray="2,2" />
        <line x1="${triX + triBase}" y1="${triY}" x2="${triX + triBase}" y2="${triY - triHeight}" stroke="#4a5568" stroke-dasharray="2,2" />
        <text x="${triX + triBase / 2}" y="${triY + 15}" text-anchor="middle" style="${textStyle}">${run}" Run</text>
        <text x="${triX + triBase + 10}" y="${triY - triHeight / 2}" dominant-baseline="middle" style="${textStyle}">${rise}" Rise</text>
      </svg>
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
                        <div class="roof-visualization-container" aria-hidden="true">
                            ${createRoofVisualizationSVG(measurements)}
                        </div>
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
                    <button id="download-pdf-btn" class="btn btn-secondary btn-large">Download PDF</button>
                    <button id="start-new-report-btn" class="btn btn-primary btn-large">Start New Report</button>
                </div>
            </div>
        </section>
    `;
    
    document.getElementById('start-new-report-btn')?.addEventListener('click', renderAddressInput);
    document.getElementById('download-pdf-btn')?.addEventListener('click', () => handleDownloadPdf(address, imageUrl, measurements));
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

/**
 * Generates and downloads a PDF of the roof report.
 * @param address The property address.
 * @param imageUrl The URL of the satellite image.
 * @param measurements The roof measurement data.
 */
async function handleDownloadPdf(address: string, imageUrl: string, measurements: Record<string, string>) {
    const downloadButton = document.getElementById('download-pdf-btn') as HTMLButtonElement;
    if (downloadButton) {
        downloadButton.disabled = true;
        downloadButton.textContent = 'Downloading...';
    }

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'px', format: 'a4' });
        const autoTable = (doc as any).autoTable;

        const MARGIN = 40;
        const PAGE_WIDTH = doc.internal.pageSize.getWidth();
        const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
        let cursorY = MARGIN;

        const checkPageBreak = (currentY: number, itemHeight: number) => {
            if (currentY + itemHeight > doc.internal.pageSize.getHeight() - MARGIN) {
                doc.addPage();
                return MARGIN;
            }
            return currentY;
        };

        // --- PDF Header ---
        doc.setFontSize(22);
        doc.setFont(undefined, 'bold');
        doc.text('Roof Measurement Report', PAGE_WIDTH / 2, cursorY, { align: 'center' });
        cursorY += 30;
        doc.setFontSize(12);
        doc.setFont(undefined, 'normal');
        doc.text(`Property Address: ${address}`, MARGIN, cursorY);
        cursorY += 30;

        // --- Satellite Image ---
        const imgWidth = CONTENT_WIDTH;
        const imgHeight = CONTENT_WIDTH; // Assuming 1:1 aspect ratio
        doc.addImage(imageUrl, 'JPEG', MARGIN, cursorY, imgWidth, imgHeight);
        cursorY += imgHeight + 20;

        cursorY = checkPageBreak(cursorY, 200);

        // --- Roof Visualization ---
        const visualizationEl = document.querySelector('.roof-visualization-container') as HTMLElement;
        if (visualizationEl) {
            doc.setFontSize(16);
            doc.setFont(undefined, 'bold');
            doc.text('Roof Diagram', MARGIN, cursorY);
            cursorY += 15;

            const canvas = await html2canvas(visualizationEl, { scale: 2 });
            const vizImgData = canvas.toDataURL('image/png');
            const vizAspectRatio = canvas.height / canvas.width;
            const vizImgWidth = CONTENT_WIDTH;
            const vizImgHeight = vizImgWidth * vizAspectRatio;

            doc.addImage(vizImgData, 'PNG', MARGIN, cursorY, vizImgWidth, vizImgHeight);
            cursorY += vizImgHeight + 30;
        }

        cursorY = checkPageBreak(cursorY, 150);

        // --- Measurements Table ---
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.text('Measurement Details', MARGIN, cursorY);
        cursorY += 15;

        const measurementRowsData = [
            { label: 'Total Area', key: 'totalArea' }, { label: 'Primary Pitch', key: 'pitch' },
            { label: 'Ridges', key: 'ridges' }, { label: 'Valleys', key: 'valleys' },
            { label: 'Eaves', key: 'eaves' }, { label: 'Rakes', key: 'rakes' },
            { label: 'Waste Factor', key: 'wasteFactor' },
        ];
        const tableBody = measurementRowsData.map(row => [row.label, measurements[row.key] || 'N/A']);
        autoTable({
            head: [['Measurement', 'Value']], body: tableBody, startY: cursorY,
            theme: 'grid', headStyles: { fillColor: [20, 121, 255] }, margin: { left: MARGIN }
        });

        // --- Save PDF ---
        doc.save(`Roof-Report-${address.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`);

    } catch (error) {
        console.error("Failed to generate PDF:", error);
        alert("Sorry, there was an error creating the PDF. Please try again.");
    } finally {
        if (downloadButton) {
            downloadButton.disabled = false;
            downloadButton.textContent = 'Download PDF';
        }
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
