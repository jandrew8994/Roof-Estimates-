import { GoogleGenAI, Type } from "@google/genai";

// --- TYPE DECLARATIONS FOR CDN LIBRARIES ---
declare const html2canvas: any;
declare global {
    interface Window {
        jspdf: any;
        google: any; // For Google Maps API
    }
}

// --- TYPE DEFINITIONS ---
type Measurements = {
    totalArea: string;
    pitch: string;
    ridges: string;
    valleys: string;
    eaves: string;
    rakes: string;
    wasteFactor: string;
};

type VisualizationConfig = {
    fillColor: string;
    strokeColor: string;
    textColor: string;
    mutedTextColor: string;
};

type CustomSection = {
    id: string;
    title: string;
};

type Template = {
    id: number;
    name: string;
    customSections: CustomSection[];
};

type Report = {
    id: number;
    address: string;
    imageUrl: string;
    measurements: Measurements;
    timestamp: string;
    templateId?: number;
    customData?: Record<string, string>; // Maps CustomSection.id to its content
    visualizationConfig?: VisualizationConfig;
};

type Profile = {
    companyName: string;
    companyAddress: string;
    logoDataUrl: string;
};


// --- DOM ELEMENT REFERENCES ---
const mainContent = document.getElementById('main-content') as HTMLElement;
const navLinks = document.querySelector('.nav-links') as HTMLElement;
const signUpNavBtn = document.getElementById('signup-nav-btn') as HTMLButtonElement;
const signInNavBtn = document.getElementById('signin-nav-btn') as HTMLButtonElement;
const historyNavLink = document.getElementById('history-nav-link') as HTMLButtonElement;
const templatesNavLink = document.getElementById('templates-nav-link') as HTMLButtonElement;
const profileNavLink = document.getElementById('profile-nav-link') as HTMLButtonElement;
const logoLink = document.getElementById('logo-link') as HTMLAnchorElement;
const modalOverlay = document.getElementById('signup-modal-overlay') as HTMLDivElement;
const closeModalBtn = document.querySelector('.modal-close-btn') as HTMLButtonElement;
const signUpForm = document.getElementById('signup-form') as HTMLFormElement;


// --- STATE ---
let ai: GoogleGenAI | null = null;
const REPORT_HISTORY_KEY = 'roofReportHistory';
const PROFILE_DATA_KEY = 'contractorProfile';
const TEMPLATE_DATA_KEY = 'reportTemplates';

// --- API & BUSINESS LOGIC ---

/**
 * Fetches a roof report by calling the Gemini API with Google Maps grounding.
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

  // --- API Call for Measurements using Google Maps Grounding ---
  const measurementsPromise = ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Acting as a roof measurement specialist, use Google Maps data to provide precise roof measurements for the property at the address: ${address}. Provide all measurements in feet and follow the JSON schema.`,
    config: {
      responseMimeType: 'application/json',
      responseSchema: measurementSchema,
      tools: [{ googleMaps: {} }], // Enable Google Maps grounding
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


/**
 * Retrieves the report history from localStorage.
 * @returns An array of Report objects.
 */
function getReportHistory(): Report[] {
    const historyJson = localStorage.getItem(REPORT_HISTORY_KEY);
    return historyJson ? JSON.parse(historyJson) : [];
}

/**
 * Saves a new report to the localStorage history.
 * @param report The new report object to save.
 * @returns The newly created report object with ID and timestamp.
 */
function saveReportToHistory(report: Omit<Report, 'id' | 'timestamp' | 'customData' | 'visualizationConfig'>): Report {
    const history = getReportHistory();
    const newReport: Report = {
        ...report,
        id: Date.now(),
        timestamp: new Date().toISOString(),
        customData: {},
        visualizationConfig: {
            fillColor: '#2D3748',
            strokeColor: '#4A5568',
            textColor: '#E2E8F0',
            mutedTextColor: '#A0AEC0'
        }
    };

    if (report.templateId) {
        const template = getTemplates().find(t => t.id === report.templateId);
        if (template) {
            template.customSections.forEach(section => {
                newReport.customData![section.id] = ''; // Initialize custom data fields
            });
        }
    }

    history.unshift(newReport); // Add to the beginning
    localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(history));
    
    historyNavLink.classList.remove('hidden');
    
    return newReport;
}


/**
 * Updates an existing report in the localStorage history.
 * @param updatedReport The report object with updated details.
 */
function updateReportInHistory(updatedReport: Report) {
    const history = getReportHistory();
    const reportIndex = history.findIndex(r => r.id === updatedReport.id);
    if (reportIndex !== -1) {
        history[reportIndex] = updatedReport;
        localStorage.setItem(REPORT_HISTORY_KEY, JSON.stringify(history));
    }
}

/**
 * Retrieves templates from localStorage.
 * @returns An array of Template objects.
 */
function getTemplates(): Template[] {
    const templatesJson = localStorage.getItem(TEMPLATE_DATA_KEY);
    return templatesJson ? JSON.parse(templatesJson) : [];
}

/**
 * Saves a template to localStorage. Handles both create and update.
 * @param template The template to save.
 */
function saveTemplate(template: Omit<Template, 'id'> | Template): Template {
    const templates = getTemplates();
    if ('id' in template && template.id) {
        // Update
        const index = templates.findIndex(t => t.id === template.id);
        if (index > -1) {
            templates[index] = template;
        } else {
            templates.unshift(template); // Should not happen but good fallback
        }
        localStorage.setItem(TEMPLATE_DATA_KEY, JSON.stringify(templates));
        return template;
    } else {
        // Create
        const newTemplate: Template = {
            ...(template as Omit<Template, 'id'>),
            id: Date.now(),
        };
        templates.unshift(newTemplate);
        localStorage.setItem(TEMPLATE_DATA_KEY, JSON.stringify(templates));
        return newTemplate;
    }
}

/**
 * Deletes a template from localStorage.
 * @param templateId The ID of the template to delete.
 */
function deleteTemplate(templateId: number) {
    let templates = getTemplates();
    templates = templates.filter(t => t.id !== templateId);
    localStorage.setItem(TEMPLATE_DATA_KEY, JSON.stringify(templates));
}


/**
 * Retrieves the user profile from localStorage.
 * @returns A Profile object or null.
 */
function getProfileData(): Profile | null {
    const profileJson = localStorage.getItem(PROFILE_DATA_KEY);
    return profileJson ? JSON.parse(profileJson) : null;
}

/**
 * Saves profile data to localStorage.
 * @param profile The profile object to save.
 */
function saveProfileData(profile: Profile) {
    localStorage.setItem(PROFILE_DATA_KEY, JSON.stringify(profile));
}

/**
 * Toggles a button's state to indicate loading.
 * @param button The button element.
 * @param isLoading True to show loading, false to revert.
 * @param loadingText The text to display while loading.
 */
function setButtonLoadingState(button: HTMLButtonElement, isLoading: boolean, loadingText: string) {
    if (isLoading) {
        button.disabled = true;
        button.classList.add('loading');
        button.dataset.originalText = button.innerHTML;
        button.innerHTML = `<span class="btn-spinner"></span> ${loadingText}`;
    } else {
        button.disabled = false;
        button.classList.remove('loading');
        if (button.dataset.originalText) {
            button.innerHTML = button.dataset.originalText;
            delete button.dataset.originalText;
        }
    }
}

/**
 * Fetches, saves, and displays a new roof report for a given address.
 * @param address The property address.
 * @param templateId The optional template ID to apply.
 */
async function generateAndDisplayReport(address: string, templateId?: number) {
    // The address form and its button are only present in the address input view.
    // We query for them here to trigger the loading state.
    const addressForm = document.getElementById('address-form');
    if (!addressForm) return;

    const button = addressForm.querySelector('button[type="submit"]') as HTMLButtonElement;

    if (!address || address.trim().length === 0) {
        alert('Please enter a valid address.');
        return;
    }

    setButtonLoadingState(button, true, 'Generating...');
    renderLoadingView();

    try {
        const { imageUrl, measurements } = await getRoofReport(address);
        const newReport = saveReportToHistory({ address, imageUrl, measurements, templateId });
        renderReportView(newReport);
    } catch (error) {
        console.error('Failed to get roof report:', error);
        alert('Sorry, we could not generate a report for that address. Please check the address and try again. This feature works best with specific street addresses.');
        renderAddressInput(); // Go back to the input form on error
    }
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
    const templates = getTemplates();
    mainContent.innerHTML = `
        <section class="report-generator-view">
            <div class="container">
                <div class="address-form-container">
                    <h1>Generate a New Roof Report</h1>
                    <p>Enter the property address below to get started.</p>
                    <form id="address-form">
                        <div class="form-group">
                            <label for="address-input">Property Address</label>
                            <input type="text" id="address-input" placeholder="e.g., 123 Maple St, Anytown, USA" required />
                        </div>
                        <div class="form-group">
                            <label for="template-select">Report Template (Optional)</label>
                            <select id="template-select">
                                <option value="">Default Report</option>
                                ${templates.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                            </select>
                        </div>
                        <button type="submit" class="btn btn-primary btn-large">Get Report</button>
                    </form>
                </div>
            </div>
        </section>
    `;

    document.getElementById('address-form')?.addEventListener('submit', handleAddressSubmit);
    
    // --- Initialize Google Maps Autocomplete ---
    const initAutocomplete = () => {
        const addressInput = document.getElementById('address-input') as HTMLInputElement;
        if (!addressInput) return;

        // Check if the Google Maps script has loaded
        if (window.google && window.google.maps && window.google.maps.places) {
            const autocomplete = new window.google.maps.places.Autocomplete(addressInput, {
                types: ['address'],
                fields: ["formatted_address"]
            });
            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (place && place.formatted_address) {
                    const address = place.formatted_address;
                    const templateSelect = document.getElementById('template-select') as HTMLSelectElement;
                    const templateId = templateSelect.value ? Number(templateSelect.value) : undefined;
                    // The input value is already set by autocomplete, so we just need to trigger the report.
                    generateAndDisplayReport(address, templateId);
                }
            });
        } else {
            // If not loaded, wait and try again
            setTimeout(initAutocomplete, 200);
        }
    };
    initAutocomplete();
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
 * Creates an enhanced 2D SVG visualization of the roof with labeled parts.
 * @param measurements The measurement data object.
 * @param config Optional color configuration object.
 * @returns An SVG string.
 */
function createRoofVisualizationSVG(measurements: Measurements, config?: VisualizationConfig): string {
    const colors: VisualizationConfig = {
        fillColor: config?.fillColor || '#2D3748',
        strokeColor: config?.strokeColor || '#4A5568',
        textColor: config?.textColor || '#E2E8F0',
        mutedTextColor: config?.mutedTextColor || '#A0AEC0',
    };

    const ridge = measurements.ridges || 'N/A';
    const eaves = measurements.eaves || 'N/A';
    const rakes = measurements.rakes || 'N/A';
    const pitch = measurements.pitch || 'N/A';

    const svgWidth = 400;
    const svgHeight = 250;
    
    // Coordinates for an isometric-style view of a simple gable roof
    const centerX = svgWidth / 2;
    const startY = 80;
    const roofWidth = 240; // Represents ridge length
    const roofSlopeHeight = 80; // Represents the length from eave to ridge on the gable end
    const perspectiveYFactor = 0.4; // Controls the "flatness" of the perspective

    const p = {
        ridgeTop:    { x: centerX, y: startY },
        ridgeBottom: { x: centerX, y: startY + roofWidth * perspectiveYFactor },
        
        leftEaveTop:    { x: centerX - roofSlopeHeight, y: startY + roofSlopeHeight * perspectiveYFactor },
        leftEaveBottom: { x: centerX - roofSlopeHeight, y: startY + (roofWidth + roofSlopeHeight) * perspectiveYFactor },

        rightEaveTop:    { x: centerX + roofSlopeHeight, y: startY + roofSlopeHeight * perspectiveYFactor },
        rightEaveBottom: { x: centerX + roofSlopeHeight, y: startY + (roofWidth + roofSlopeHeight) * perspectiveYFactor },
    };

    const textStyle = `font-family: var(--body-font); font-size: 11px; fill: ${colors.mutedTextColor};`;
    const labelStyle = `font-family: var(--body-font); font-size: 13px; font-weight: 600; fill: ${colors.textColor};`;
    const shapeStyle = `fill: ${colors.fillColor}; stroke: ${colors.strokeColor}; stroke-width: 1.5; stroke-linejoin: round;`;
    const lineStyle = `stroke: ${colors.mutedTextColor}; stroke-width: 1; stroke-dasharray: 3,3;`;

    return `
      <svg viewBox="0 0 ${svgWidth} ${svgHeight}" xmlns="http://www.w3.org/2000/svg" aria-labelledby="visTitle" role="img">
        <title id="visTitle">Roof Diagram</title>
        
        <text x="${svgWidth / 2}" y="30" text-anchor="middle" style="${labelStyle.replace('13px', '16px')}">Roof Diagram</text>

        <!-- Roof Planes -->
        <polygon points="${p.ridgeTop.x},${p.ridgeTop.y} ${p.ridgeBottom.x},${p.ridgeBottom.y} ${p.leftEaveBottom.x},${p.leftEaveBottom.y} ${p.leftEaveTop.x},${p.leftEaveTop.y}" style="${shapeStyle}" />
        <polygon points="${p.ridgeTop.x},${p.ridgeTop.y} ${p.ridgeBottom.x},${p.ridgeBottom.y} ${p.rightEaveBottom.x},${p.rightEaveBottom.y} ${p.rightEaveTop.x},${p.rightEaveTop.y}" style="${shapeStyle}" />

        <!-- Labels and Dimension Lines -->

        <!-- Ridge Label -->
        <line x1="${p.ridgeTop.x}" y1="${p.ridgeTop.y}" x2="${p.ridgeTop.x - 40}" y2="${p.ridgeTop.y - 25}" style="${lineStyle}" />
        <text x="${p.ridgeTop.x - 45}" y="${p.ridgeTop.y - 28}" text-anchor="end">
          <tspan style="${labelStyle}">Ridge</tspan>
          <tspan x="${p.ridgeTop.x - 45}" dy="1.2em" style="${textStyle}">${ridge}</tspan>
        </text>

        <!-- Eave Label -->
        <line x1="${p.leftEaveBottom.x + 20}" y1="${p.leftEaveBottom.y}" x2="${p.leftEaveBottom.x + 20}" y2="${p.leftEaveBottom.y + 30}" style="${lineStyle}" />
        <text x="${p.leftEaveBottom.x + 25}" y="${p.leftEaveBottom.y + 35}">
          <tspan style="${labelStyle}">Eaves</tspan>
          <tspan x="${p.leftEaveBottom.x + 25}" dy="1.2em" style="${textStyle}">${eaves}</tspan>
        </text>

        <!-- Rake Label -->
        <line x1="${p.rightEaveBottom.x}" y1="${p.rightEaveBottom.y}" x2="${p.rightEaveBottom.x + 40}" y2="${p.rightEaveBottom.y + 15}" style="${lineStyle}" />
        <text x="${p.rightEaveBottom.x + 45}" y="${p.rightEaveBottom.y + 18}">
          <tspan style="${labelStyle}">Rakes</tspan>
          <tspan x="${p.rightEaveBottom.x + 45}" dy="1.2em" style="${textStyle}">${rakes}</tspan>
        </text>
        
        <!-- Pitch Label -->
        <text x="${svgWidth / 2}" y="${svgHeight - 15}" text-anchor="middle">
            <tspan style="${labelStyle}">Pitch: </tspan>
            <tspan style="${textStyle}">${pitch}</tspan>
        </text>

      </svg>
    `;
}

/**
 * Renders the final report view with the image and measurements.
 * @param report The full report object to display.
 */
function renderReportView(report: Report) {
    const { address, imageUrl, measurements, templateId, customData, visualizationConfig } = report;
    
    const measurementRows = [
        { label: 'Total Area', key: 'totalArea' },
        { label: 'Primary Pitch', key: 'pitch' },
        { label: 'Ridges', key: 'ridges' },
        { label: 'Valleys', key: 'valleys' },
        { label: 'Eaves', key: 'eaves' },
        { label: 'Rakes', key: 'rakes' },
        { label: 'Waste Factor', key: 'wasteFactor' },
    ] as const;

    let customSectionsHtml = '';
    if (templateId) {
        const template = getTemplates().find(t => t.id === templateId);
        if (template) {
            customSectionsHtml = `
                <div class="custom-sections-container">
                    <h2 class="custom-sections-title">${template.name} - Custom Notes</h2>
                    ${template.customSections.map(section => `
                        <div class="custom-section">
                            <h3>${section.title}</h3>
                            <div class="custom-section-content" data-section-id="${section.id}">
                                <p>${(customData?.[section.id] || 'No notes added yet.').replace(/\n/g, '<br>')}</p>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        }
    }
    
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
                            ${createRoofVisualizationSVG(measurements, visualizationConfig)}
                        </div>
                        <div id="visualization-controls" class="hidden"></div>
                        <table class="measurements-table">
                            <tbody>
                                ${measurementRows.map(row => `
                                    <tr>
                                        <td><strong>${row.label}</strong></td>
                                        <td data-key="${row.key}">
                                            <span class="measurement-value">${measurements[row.key] || 'N/A'}</span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
                ${customSectionsHtml}
                <div class="report-actions">
                    <button id="edit-report-btn" class="btn btn-secondary btn-large">Edit Details</button>
                    <button id="download-pdf-btn" class="btn btn-secondary btn-large">Download PDF</button>
                    <button id="start-new-report-btn" class="btn btn-primary btn-large">Start New Report</button>
                </div>
            </div>
        </section>
    `;
    
    document.getElementById('start-new-report-btn')?.addEventListener('click', renderAddressInput);
    document.getElementById('download-pdf-btn')?.addEventListener('click', () => handleDownloadPdf(report));
    document.getElementById('edit-report-btn')?.addEventListener('click', () => handleToggleEditMode(true, report));
}

/**
 * Renders the report history view.
 */
function renderHistoryView() {
    const history = getReportHistory();

    if (history.length === 0) {
        mainContent.innerHTML = `
            <section class="history-view">
                <div class="container">
                    <div class="empty-history-view">
                        <h2>No Reports Found</h2>
                        <p>You haven't generated any roof reports yet. Get started by creating your first one!</p>
                        <button id="generate-first-report-btn" class="btn btn-primary btn-large">Generate New Report</button>
                    </div>
                </div>
            </section>
        `;
        document.getElementById('generate-first-report-btn')?.addEventListener('click', renderAddressInput);
        return;
    }

    mainContent.innerHTML = `
        <section class="history-view">
            <div class="container">
                <h1>Your Report History</h1>
                <div class="history-search-container">
                    <input type="search" id="history-search-input" placeholder="Search by address or date..." aria-label="Search reports by address or date">
                </div>
                <div class="history-grid">
                    ${history.map(report => `
                        <div class="history-card" data-report-id="${report.id}">
                            <div class="history-card-img-container">
                                <img src="${report.imageUrl}" alt="Satellite view of ${report.address}" loading="lazy" />
                            </div>
                            <div class="history-card-content">
                                <h3>${report.address}</h3>
                                <p>Generated: ${new Date(report.timestamp).toLocaleDateString()}</p>
                                <button class="btn btn-primary view-report-btn">View Report</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <div id="no-results-message" class="empty-history-view hidden">
                  <h2>No Matching Reports</h2>
                  <p>Try searching for a different address or date.</p>
                </div>
            </div>
        </section>
    `;

    document.querySelectorAll('.view-report-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const card = (e.target as HTMLElement).closest('.history-card');
            const reportId = card?.getAttribute('data-report-id');
            if (reportId) {
                const reportToView = history.find(r => r.id === parseInt(reportId));
                if (reportToView) {
                    renderReportView(reportToView);
                }
            }
        });
    });

    const searchInput = document.getElementById('history-search-input');
    searchInput?.addEventListener('input', handleHistorySearch);
}

/**
 * Renders the template management view.
 */
function renderTemplatesView() {
    const templates = getTemplates();
    if (templates.length === 0) {
        mainContent.innerHTML = `
            <section class="history-view">
                <div class="container">
                    <div class="empty-history-view">
                        <h2>No Templates Found</h2>
                        <p>Templates allow you to add custom sections like checklists or notes to your reports.</p>
                        <button id="create-first-template-btn" class="btn btn-primary btn-large">Create Your First Template</button>
                    </div>
                </div>
            </section>
        `;
        document.getElementById('create-first-template-btn')?.addEventListener('click', () => renderTemplateEditorView());
        return;
    }

    mainContent.innerHTML = `
        <section class="history-view">
            <div class="container">
                <div class="view-header">
                    <h1>Report Templates</h1>
                    <button id="create-new-template-btn" class="btn btn-primary">Create New Template</button>
                </div>
                <div class="templates-grid">
                    ${templates.map(template => `
                        <div class="template-card" data-template-id="${template.id}">
                            <div class="template-card-content">
                                <h3>${template.name}</h3>
                                <p>${template.customSections.length} custom section(s)</p>
                                <ul>
                                    ${template.customSections.slice(0, 3).map(s => `<li>${s.title}</li>`).join('')}
                                    ${template.customSections.length > 3 ? `<li>...and more</li>` : ''}
                                </ul>
                            </div>
                            <div class="template-card-actions">
                                <button class="btn btn-secondary edit-template-btn">Edit</button>
                                <button class="btn btn-danger delete-template-btn">Delete</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        </section>
    `;

    document.getElementById('create-new-template-btn')?.addEventListener('click', () => renderTemplateEditorView());
    document.querySelectorAll('.edit-template-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const card = (e.target as HTMLElement).closest('.template-card');
            const templateId = Number(card?.getAttribute('data-template-id'));
            const template = templates.find(t => t.id === templateId);
            if(template) renderTemplateEditorView(template);
        });
    });
    document.querySelectorAll('.delete-template-btn').forEach(btn => {
        btn.addEventListener('click', e => {
            const card = (e.target as HTMLElement).closest('.template-card');
            const templateId = Number(card?.getAttribute('data-template-id'));
            if(confirm('Are you sure you want to delete this template? This cannot be undone.')) {
                deleteTemplate(templateId);
                renderTemplatesView();
            }
        });
    });
}

/**
 * Renders the form to create or edit a template.
 * @param template Optional template object for editing.
 */
function renderTemplateEditorView(template?: Template) {
    const isEditing = !!template;
    mainContent.innerHTML = `
    <section class="profile-view">
        <div class="container">
            <form class="profile-form-container" id="template-editor-form">
                <h1>${isEditing ? 'Edit' : 'Create'} Report Template</h1>
                <div class="form-group">
                    <label for="template-name">Template Name</label>
                    <input type="text" id="template-name" value="${template?.name || ''}" placeholder="e.g., Insurance Claim Report" required>
                </div>

                <div class="form-group">
                    <label>Custom Sections</label>
                    <div id="custom-sections-list">
                        ${template?.customSections.map(section => `
                            <div class="custom-section-item" data-id="${section.id}" draggable="true">
                                <span class="drag-handle" aria-hidden="true">⠿</span>
                                <span class="section-title-text">${section.title}</span>
                                <input type="text" value="${section.title}" class="section-title-input hidden" required>
                                <div class="section-item-actions">
                                    <button type="button" class="btn-edit-section" aria-label="Edit section">Edit</button>
                                    <button type="button" class="btn-save-section hidden" aria-label="Save section">Save</button>
                                    <button type="button" class="btn-remove-section" aria-label="Remove section">&times;</button>
                                </div>
                            </div>
                        `).join('') || ''}
                    </div>
                    <div class="add-section-container">
                        <label class="add-section-label">Add a section</label>
                        <div class="quick-add-pills">
                            <button type="button" class="quick-add-pill" data-title="On-site Notes">+ On-site Notes</button>
                            <button type="button" class="quick-add-pill" data-title="Damage Assessment">+ Damage Assessment</button>
                            <button type="button" class="quick-add-pill" data-title="Material Checklist">+ Material Checklist</button>
                            <button type="button" class="quick-add-pill" data-title="Client Conversation Log">+ Client Log</button>
                            <button type="button" class="quick-add-pill" data-title="Photo Log">+ Photo Log</button>
                        </div>
                        <form class="custom-add-section" id="custom-add-form">
                            <input type="text" id="custom-section-input" placeholder="Or enter a custom section title...">
                            <button type="submit" class="btn btn-secondary">Add</button>
                        </form>
                    </div>
                </div>

                <div class="form-actions">
                    <button type="button" id="cancel-template-edit" class="btn btn-secondary btn-large">Cancel</button>
                    <button type="submit" class="btn btn-primary btn-large">Save Template</button>
                </div>
            </form>
        </div>
    </section>
    `;

    const sectionsList = document.getElementById('custom-sections-list') as HTMLDivElement;

    const setupSectionItemEventListeners = (item: HTMLElement) => {
        const textSpan = item.querySelector('.section-title-text') as HTMLSpanElement;
        const input = item.querySelector('.section-title-input') as HTMLInputElement;
        const editBtn = item.querySelector('.btn-edit-section') as HTMLButtonElement;
        const saveBtn = item.querySelector('.btn-save-section') as HTMLButtonElement;
        const removeBtn = item.querySelector('.btn-remove-section') as HTMLButtonElement;

        const enterEditMode = () => {
            textSpan.classList.add('hidden');
            editBtn.classList.add('hidden');
            input.classList.remove('hidden');
            saveBtn.classList.remove('hidden');
            input.value = textSpan.textContent || '';
            input.select();
        };

        const exitEditMode = () => {
            const newTitle = input.value.trim();
            if (newTitle) {
                textSpan.textContent = newTitle;
                input.value = newTitle;
            }
            input.classList.add('hidden');
            saveBtn.classList.add('hidden');
            textSpan.classList.remove('hidden');
            editBtn.classList.remove('hidden');
        };

        editBtn.addEventListener('click', enterEditMode);
        saveBtn.addEventListener('click', exitEditMode);
        removeBtn.addEventListener('click', () => item.remove());

        input.addEventListener('keydown', e => {
            if (e.key === 'Enter') {
                e.preventDefault();
                exitEditMode();
            } else if (e.key === 'Escape') {
                exitEditMode();
            }
        });
    };

    const addSectionItem = (id = `new_${Date.now()}`, title = '') => {
        const div = document.createElement('div');
        div.className = 'custom-section-item';
        div.dataset.id = id;
        div.draggable = true;
        div.innerHTML = `
            <span class="drag-handle" aria-hidden="true">⠿</span>
            <span class="section-title-text">${title || 'New Section'}</span>
            <input type="text" value="${title}" class="section-title-input hidden" required>
            <div class="section-item-actions">
                <button type="button" class="btn-edit-section" aria-label="Edit section">Edit</button>
                <button type="button" class="btn-save-section hidden" aria-label="Save section">Save</button>
                <button type="button" class="btn-remove-section" aria-label="Remove section">&times;</button>
            </div>
        `;
        setupSectionItemEventListeners(div);
        sectionsList.appendChild(div);
        if (!title) {
            (div.querySelector('.btn-edit-section') as HTMLButtonElement).click();
        }
    };

    sectionsList.querySelectorAll<HTMLElement>('.custom-section-item').forEach(setupSectionItemEventListeners);
    
    // Quick Add Pills
    const quickAddPillsContainer = document.querySelector('.quick-add-pills');
    quickAddPillsContainer?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('quick-add-pill')) {
            const title = target.dataset.title;
            if (title) {
                addSectionItem(undefined, title);
            }
        }
    });

    // Custom Add Form
    const customAddForm = document.getElementById('custom-add-form') as HTMLFormElement;
    customAddForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const customSectionInput = document.getElementById('custom-section-input') as HTMLInputElement;
        const title = customSectionInput.value.trim();
        if (title) {
            addSectionItem(undefined, title);
            customSectionInput.value = '';
            customSectionInput.focus();
        }
    });

    // --- Drag and Drop Logic ---
    function getDragAfterElement(container: HTMLElement, y: number) {
        const draggableElements = [...container.querySelectorAll<HTMLElement>('.custom-section-item:not(.dragging)')];
        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset: offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY, element: null as (HTMLElement | null) }).element;
    }

    sectionsList.addEventListener('dragstart', e => {
        const target = (e.target as HTMLElement).closest('.custom-section-item');
        if (target) {
            target.classList.add('dragging');
        }
    });

    sectionsList.addEventListener('dragend', e => {
        const target = (e.target as HTMLElement).closest('.custom-section-item');
        if (target) {
            target.classList.remove('dragging');
        }
    });

    sectionsList.addEventListener('dragover', e => {
        e.preventDefault();
        const draggingItem = sectionsList.querySelector('.dragging');
        if (!draggingItem) return;
        const afterElement = getDragAfterElement(sectionsList, e.clientY);
        if (afterElement == null) {
            sectionsList.appendChild(draggingItem);
        } else {
            sectionsList.insertBefore(draggingItem, afterElement);
        }
    });
    
    document.getElementById('cancel-template-edit')?.addEventListener('click', renderTemplatesView);
    document.getElementById('template-editor-form')?.addEventListener('submit', (e) => handleTemplateSave(e, template?.id));
}


/**
 * Renders the user profile view.
 */
function renderProfileView() {
    const profile = getProfileData();
    mainContent.innerHTML = `
        <section class="profile-view">
            <div class="container">
                <div class="profile-form-container">
                    <h1>Company Profile</h1>
                    <p>This information will appear on your PDF reports.</p>
                    <form id="profile-form">
                        <div class="form-group">
                            <label>Company Logo</label>
                            <div class="logo-preview-container">
                                ${profile?.logoDataUrl ? 
                                    `<img src="${profile.logoDataUrl}" alt="Company Logo Preview" class="logo-preview-img">` : 
                                    '<p class="logo-placeholder">No logo uploaded</p>'}
                            </div>
                            <label for="logo-input" class="btn btn-secondary">Upload Logo</label>
                            <input type="file" id="logo-input" accept="image/png, image/jpeg" class="hidden-file-input">
                        </div>
                        <div class="form-group">
                            <label for="company-name-input">Company Name</label>
                            <input type="text" id="company-name-input" value="${profile?.companyName || ''}" required>
                        </div>
                        <div class="form-group">
                            <label for="company-address-input">Company Address</label>
                            <textarea id="company-address-input" rows="3">${profile?.companyAddress || ''}</textarea>
                        </div>
                        <button type="submit" class="btn btn-primary btn-large">Save Profile</button>
                    </form>
                </div>
            </div>
        </section>
    `;

    const logoInput = document.getElementById('logo-input') as HTMLInputElement;
    const previewContainer = document.querySelector('.logo-preview-container') as HTMLDivElement;
    
    logoInput?.addEventListener('change', () => {
        const file = logoInput.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                previewContainer.innerHTML = `<img src="${event.target?.result}" alt="Company Logo Preview" class="logo-preview-img">`;
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('profile-form')?.addEventListener('submit', handleProfileSave);
}

// --- EVENT HANDLERS ---

/**
 * Handles saving or updating a report template.
 * @param e The form submission event.
 * @param templateId The ID of the template being edited, if any.
 */
function handleTemplateSave(e: Event, templateId?: number) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const name = (form.querySelector('#template-name') as HTMLInputElement).value.trim();
    if (!name) {
        alert('Please enter a template name.');
        return;
    }
    const sectionItems = form.querySelectorAll<HTMLDivElement>('.custom-section-item');
    const customSections: CustomSection[] = [];

    sectionItems.forEach(item => {
        const title = (item.querySelector('.section-title-input') as HTMLInputElement).value.trim();
        if(title) {
            let sectionId = item.dataset.id!;
            if (sectionId.startsWith('new_')) {
                // Generate a more permanent-looking ID for new sections
                sectionId = `s_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
            }
            customSections.push({
                id: sectionId,
                title: title
            });
        }
    });

    const templateData: Partial<Template> = { id: templateId, name, customSections };
    if (!templateId) {
      delete templateData.id;
    }
    
    saveTemplate(templateData as Template);
    renderTemplatesView();
}


/**
 * Handles filtering the report history based on user input.
 * @param e The input event from the search field.
 */
function handleHistorySearch(e: Event) {
    const searchTerm = (e.target as HTMLInputElement).value.toLowerCase();
    const cards = document.querySelectorAll('.history-card');
    const noResultsMessage = document.getElementById('no-results-message');
    let visibleCount = 0;

    cards.forEach(card => {
        const cardElement = card as HTMLElement;
        const address = cardElement.querySelector('h3')?.textContent?.toLowerCase() || '';
        const date = cardElement.querySelector('p')?.textContent?.toLowerCase() || '';
        if (address.includes(searchTerm) || date.includes(searchTerm)) {
            cardElement.style.display = 'flex';
            visibleCount++;
        } else {
            cardElement.style.display = 'none';
        }
    });

    if (noResultsMessage) {
        if (visibleCount === 0) {
            noResultsMessage.classList.remove('hidden');
        } else {
            noResultsMessage.classList.add('hidden');
        }
    }
}

/**
 * Handles saving the user's profile data.
 * @param e The form submission event.
 */
function handleProfileSave(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const button = form.querySelector('button[type="submit"]') as HTMLButtonElement;
    const companyName = (form.querySelector('#company-name-input') as HTMLInputElement).value;
    const companyAddress = (form.querySelector('#company-address-input') as HTMLTextAreaElement).value;
    const logoInput = form.querySelector('#logo-input') as HTMLInputElement;

    const currentProfile = getProfileData() || { companyName: '', companyAddress: '', logoDataUrl: '' };
    const file = logoInput.files?.[0];
    
    setButtonLoadingState(button, true, 'Saving...');

    const onSaveSuccess = (newProfile: Profile) => {
        saveProfileData(newProfile);
        const originalText = button.dataset.originalText || 'Save Profile';
        button.innerHTML = 'Saved!';
        // Keep it disabled for the confirmation message
        setTimeout(() => {
            button.innerHTML = originalText;
            button.disabled = false;
            button.classList.remove('loading');
            delete button.dataset.originalText;
        }, 1500);
    };

    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const logoDataUrl = event.target?.result as string;
            onSaveSuccess({ companyName, companyAddress, logoDataUrl });
        };
        reader.onerror = () => {
            setButtonLoadingState(button, false, ''); // Revert on error
            alert('Error reading the logo file. Please try again.');
        };
        reader.readAsDataURL(file);
    } else {
        // Simulate a short delay for UX consistency
        setTimeout(() => {
            onSaveSuccess({ ...currentProfile, companyName, companyAddress });
        }, 300);
    }
}


/**
 * Handles the submission of the address form via button click.
 * @param e The form submission event.
 */
async function handleAddressSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const input = form.querySelector('#address-input') as HTMLInputElement;
    const templateSelect = form.querySelector('#template-select') as HTMLSelectElement;
    const address = input.value.trim();
    const templateId = templateSelect.value ? Number(templateSelect.value) : undefined;
    generateAndDisplayReport(address, templateId);
}

/**
 * Toggles the report view between showing static text and editable input fields.
 * @param isEditing True to switch to edit mode, false to switch back.
 * @param report The report data object.
 */
function handleToggleEditMode(isEditing: boolean, report: Report) {
    const tableCells = document.querySelectorAll('.measurements-table td[data-key]');
    const actionsContainer = document.querySelector('.report-actions');
    const customSectionsContainer = document.querySelector('.custom-sections-container');
    const vizControlsContainer = document.getElementById('visualization-controls');
    
    if (isEditing && actionsContainer) {
        tableCells.forEach(cell => {
            const key = cell.getAttribute('data-key') as keyof Measurements;
            const value = report.measurements[key] || '';
            const valueSpan = cell.querySelector('.measurement-value');
            if(valueSpan) {
                valueSpan.outerHTML = `<input type="text" class="measurement-input" value="${value}" />`;
            }
        });

        if (report.templateId && customSectionsContainer) {
            const contentDivs = customSectionsContainer.querySelectorAll<HTMLDivElement>('.custom-section-content');
            contentDivs.forEach(div => {
                const sectionId = div.dataset.sectionId!;
                const content = report.customData?.[sectionId] || '';
                div.innerHTML = `<textarea class="custom-section-textarea" data-section-id="${sectionId}" rows="5">${content}</textarea>`;
            });
        }

        if (vizControlsContainer) {
            vizControlsContainer.classList.remove('hidden');
            const currentConfig = report.visualizationConfig || { 
                fillColor: '#2D3748', strokeColor: '#4A5568', 
                textColor: '#E2E8F0', mutedTextColor: '#A0AEC0' 
            };
            vizControlsContainer.innerHTML = `
                <div class="vis-controls-header">
                    <h4>Customize Diagram</h4>
                    <button type="button" class="btn-link" id="reset-vis-colors-btn">Reset to Default</button>
                </div>
                <div class="vis-controls-grid">
                    <div class="vis-control">
                        <label for="fill-color-picker">Fill</label>
                        <input type="color" id="fill-color-picker" value="${currentConfig.fillColor}">
                    </div>
                    <div class="vis-control">
                        <label for="stroke-color-picker">Lines</label>
                        <input type="color" id="stroke-color-picker" value="${currentConfig.strokeColor}">
                    </div>
                    <div class="vis-control">
                        <label for="text-color-picker">Text</label>
                        <input type="color" id="text-color-picker" value="${currentConfig.textColor}">
                    </div>
                    <div class="vis-control">
                        <label for="muted-text-color-picker">Muted Text</label>
                        <input type="color" id="muted-text-color-picker" value="${currentConfig.mutedTextColor}">
                    </div>
                </div>
            `;
    
            const updateVisualization = () => {
                const newConfig: VisualizationConfig = {
                    fillColor: (document.getElementById('fill-color-picker') as HTMLInputElement).value,
                    strokeColor: (document.getElementById('stroke-color-picker') as HTMLInputElement).value,
                    textColor: (document.getElementById('text-color-picker') as HTMLInputElement).value,
                    mutedTextColor: (document.getElementById('muted-text-color-picker') as HTMLInputElement).value,
                };
                const svgContainer = document.querySelector('.roof-visualization-container');
                if (svgContainer) {
                    svgContainer.innerHTML = createRoofVisualizationSVG(report.measurements, newConfig);
                }
            };
    
            vizControlsContainer.querySelectorAll('input[type="color"]').forEach(input => {
                input.addEventListener('input', updateVisualization);
            });

            document.getElementById('reset-vis-colors-btn')?.addEventListener('click', () => {
                const defaultColors = {
                    fillColor: '#2D3748',
                    strokeColor: '#4A5568',
                    textColor: '#E2E8F0',
                    mutedTextColor: '#A0AEC0'
                };
                (document.getElementById('fill-color-picker') as HTMLInputElement).value = defaultColors.fillColor;
                (document.getElementById('stroke-color-picker') as HTMLInputElement).value = defaultColors.strokeColor;
                (document.getElementById('text-color-picker') as HTMLInputElement).value = defaultColors.textColor;
                (document.getElementById('muted-text-color-picker') as HTMLInputElement).value = defaultColors.mutedTextColor;
                updateVisualization();
            });
        }

        actionsContainer.innerHTML = `
            <button id="cancel-edit-btn" class="btn btn-secondary btn-large">Cancel</button>
            <button id="save-changes-btn" class="btn btn-primary btn-large">Save Changes</button>
        `;
        document.getElementById('save-changes-btn')?.addEventListener('click', () => handleSaveChanges(report));
        document.getElementById('cancel-edit-btn')?.addEventListener('click', () => renderReportView(report));
    }
}

/**
 * Saves the edited measurement values from the input fields.
 * @param originalReport The report object before edits.
 */
function handleSaveChanges(originalReport: Report) {
    const saveButton = document.getElementById('save-changes-btn') as HTMLButtonElement;
    if (saveButton) {
        setButtonLoadingState(saveButton, true, 'Saving...');
    }

    const newMeasurements: Partial<Measurements> = {};
    const inputElements = document.querySelectorAll('.measurement-input');

    inputElements.forEach(el => {
        const input = el as HTMLInputElement;
        const cell = input.closest('td[data-key]');
        const key = cell?.getAttribute('data-key') as keyof Measurements;
        if (key) {
            newMeasurements[key] = input.value;
        }
    });

    const newCustomData: Record<string, string> = { ...originalReport.customData };
    document.querySelectorAll<HTMLTextAreaElement>('.custom-section-textarea').forEach(textarea => {
        const sectionId = textarea.dataset.sectionId!;
        newCustomData[sectionId] = textarea.value;
    });

    const newVisualizationConfig: VisualizationConfig = {
        fillColor: (document.getElementById('fill-color-picker') as HTMLInputElement).value,
        strokeColor: (document.getElementById('stroke-color-picker') as HTMLInputElement).value,
        textColor: (document.getElementById('text-color-picker') as HTMLInputElement).value,
        mutedTextColor: (document.getElementById('muted-text-color-picker') as HTMLInputElement).value,
    };

    const updatedReport: Report = {
        ...originalReport,
        measurements: {
            ...originalReport.measurements,
            ...newMeasurements
        },
        customData: newCustomData,
        visualizationConfig: newVisualizationConfig
    };

    setTimeout(() => {
        updateReportInHistory(updatedReport);
        renderReportView(updatedReport); // Re-render with saved data
    }, 300);
}

/**
 * Generates and downloads a PDF of the roof report.
 * @param report The full report object.
 */
async function handleDownloadPdf(report: Report) {
    const downloadButton = document.getElementById('download-pdf-btn') as HTMLButtonElement;
    if (!downloadButton) return;
    
    const { address, imageUrl, measurements, templateId, customData } = report;
    
    setButtonLoadingState(downloadButton, true, 'Downloading...');

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'px', format: 'a4' });
        const autoTable = (doc as any).autoTable;

        const profile = getProfileData();
        const MARGIN = 40;
        const PAGE_WIDTH = doc.internal.pageSize.getWidth();
        const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;
        let cursorY = MARGIN;

        // --- PDF Header with Profile Info ---
        if (profile) {
            const hasLogo = profile.logoDataUrl && profile.logoDataUrl.startsWith('data:image');
            
            if (hasLogo) {
                try {
                    const img = new Image();
                    img.src = profile.logoDataUrl;
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                    });
                    const imageFormat = profile.logoDataUrl.split(';')[0].split('/')[1].toUpperCase();
                    const logoHeight = 40;
                    const logoWidth = (img.width * logoHeight) / img.height;
                    doc.addImage(profile.logoDataUrl, imageFormat, MARGIN, cursorY, logoWidth, logoHeight);
                } catch (e) {
                    console.error("Could not load profile logo for PDF:", e);
                }
            }

            doc.setFontSize(10);
            doc.setFont(undefined, 'bold');
            doc.text(profile.companyName || '', PAGE_WIDTH - MARGIN, cursorY + 5, { align: 'right' });
            doc.setFont(undefined, 'normal');
            
            const addressLines = doc.splitTextToSize(profile.companyAddress || '', 120);
            doc.text(addressLines, PAGE_WIDTH - MARGIN, cursorY + 18, { align: 'right' });
            
            cursorY += 60;
            doc.setDrawColor(226, 232, 240);
            doc.line(MARGIN, cursorY - 10, PAGE_WIDTH - MARGIN, cursorY - 10);
        }

        const checkPageBreak = (currentY: number, itemHeight: number) => {
            if (currentY + itemHeight > doc.internal.pageSize.getHeight() - MARGIN) {
                doc.addPage();
                return MARGIN;
            }
            return currentY;
        };

        // --- PDF Main Title ---
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
        const imgHeight = CONTENT_WIDTH;
        doc.addImage(imageUrl, 'JPEG', MARGIN, cursorY, imgWidth, imgHeight);
        cursorY += imgHeight + 20;

        cursorY = checkPageBreak(cursorY, 200);

        // --- Roof Visualization ---
        const visualizationEl = document.querySelector('.roof-visualization-container') as HTMLElement;
        if (visualizationEl) {
            doc.setFontSize(16); doc.setFont(undefined, 'bold');
            doc.text('Roof Diagram', MARGIN, cursorY);
            cursorY += 15;

            // Temporarily replace SVG text colors for PDF generation if they are dark
            const vizConfig = report.visualizationConfig;
            const pdfVizConfig: VisualizationConfig = {
                fillColor: vizConfig?.fillColor || '#FFFFFF',
                strokeColor: vizConfig?.strokeColor || '#444444',
                textColor: '#000000',
                mutedTextColor: '#555555'
            };
            visualizationEl.innerHTML = createRoofVisualizationSVG(measurements, pdfVizConfig);

            const canvas = await html2canvas(visualizationEl, { scale: 2, backgroundColor: '#ffffff' }); // Force white background
            
            // Restore original SVG
            visualizationEl.innerHTML = createRoofVisualizationSVG(measurements, vizConfig);

            const vizImgData = canvas.toDataURL('image/png');
            const vizAspectRatio = canvas.height / canvas.width;
            const vizImgWidth = CONTENT_WIDTH;
            const vizImgHeight = vizImgWidth * vizAspectRatio;
            doc.addImage(vizImgData, 'PNG', MARGIN, cursorY, vizImgWidth, vizImgHeight);
            cursorY += vizImgHeight + 30;
        }


        cursorY = checkPageBreak(cursorY, 150);

        // --- Measurements Table ---
        doc.setFontSize(16); doc.setFont(undefined, 'bold');
        doc.text('Measurement Details', MARGIN, cursorY);
        
        const measurementRowsData = [
            { label: 'Total Area', key: 'totalArea' }, { label: 'Primary Pitch', key: 'pitch' },
            { label: 'Ridges', key: 'ridges' }, { label: 'Valleys', key: 'valleys' },
            { label: 'Eaves', key: 'eaves' }, { label: 'Rakes', key: 'rakes' },
            { label: 'Waste Factor', key: 'wasteFactor' },
        ] as const;
        const tableBody = measurementRowsData.map(row => [row.label, measurements[row.key] || 'N/A']);
        autoTable({
            head: [['Measurement', 'Value']], body: tableBody, startY: cursorY + 15,
            theme: 'grid', headStyles: { fillColor: [217, 4, 41] }, margin: { left: MARGIN }
        });
        cursorY = (doc as any).lastAutoTable.finalY || cursorY;

        // --- Custom Sections ---
        if (templateId && customData) {
            const template = getTemplates().find(t => t.id === templateId);
            if (template && template.customSections.length > 0) {
                cursorY = checkPageBreak(cursorY, 40);
                cursorY += 30;
                doc.setFontSize(16); doc.setFont(undefined, 'bold');
                doc.text(`${template.name} - Custom Notes`, MARGIN, cursorY);
                cursorY += 20;

                template.customSections.forEach(section => {
                    const content = customData[section.id];
                    if (content) {
                        cursorY = checkPageBreak(cursorY, 40);
                        doc.setFontSize(12); doc.setFont(undefined, 'bold');
                        doc.text(section.title, MARGIN, cursorY);
                        cursorY += 15;
                        doc.setFont(undefined, 'normal');
                        const textLines = doc.splitTextToSize(content, CONTENT_WIDTH);
                        textLines.forEach((line: string) => {
                           cursorY = checkPageBreak(cursorY, 15);
                           doc.text(line, MARGIN, cursorY);
                           cursorY += 15;
                        });
                        cursorY += 10;
                    }
                });
            }
        }


        // --- Save PDF ---
        doc.save(`Roof-Report-${address.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`);

    } catch (error) {
        console.error("Failed to generate PDF:", error);
        alert("Sorry, there was an error creating the PDF. Please try again.");
    } finally {
        setButtonLoadingState(downloadButton, false, '');
    }
}


// --- APP INITIALIZATION & NAVIGATION ---

/**
 * Shows the signup modal.
 */
function openModal() {
    modalOverlay.classList.remove('hidden');
}

/**
 * Hides the signup modal.
 */
function closeModal() {
    modalOverlay.classList.add('hidden');
    // Clear any validation errors when closing
    const emailInput = document.getElementById('email') as HTMLInputElement | null;
    const emailError = document.getElementById('email-error') as HTMLDivElement | null;
    if (emailInput && emailError) {
        emailInput.classList.remove('invalid');
        emailError.textContent = '';
    }
}

/**
 * Handles the signup form submission, transitioning the user into the app.
 * @param e The form submission event.
 */
function handleSignUpFormSubmit(e: Event) {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const emailInput = form.querySelector('#email') as HTMLInputElement;
    const emailError = document.getElementById('email-error') as HTMLDivElement;
    const email = emailInput.value.trim();

    // Clear previous errors
    emailInput.classList.remove('invalid');
    emailError.textContent = '';

    // Simple regex for email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (email === '') {
        emailInput.classList.add('invalid');
        emailError.textContent = 'Email address is required.';
        emailInput.focus();
        return;
    }

    if (!emailRegex.test(email)) {
        emailInput.classList.add('invalid');
        emailError.textContent = 'Please enter a valid email address.';
        emailInput.focus();
        return;
    }

    closeModal();
    renderAddressInput();

    // Update nav to reflect "logged-in" state
    signInNavBtn.classList.add('hidden');
    signUpNavBtn.textContent = 'New Report';
    signUpNavBtn.removeEventListener('click', openModal);
    signUpNavBtn.addEventListener('click', renderAddressInput);

    profileNavLink.classList.remove('hidden');
    templatesNavLink.classList.remove('hidden');
    
    if (getReportHistory().length > 0) {
        historyNavLink.classList.remove('hidden');
    }
}

/**
 * Initializes the application, sets up static event listeners.
 */
function init() {
    // Main navigation
    logoLink.addEventListener('click', (e) => {
        e.preventDefault();
        renderLandingPage();
    });
    historyNavLink.addEventListener('click', (e) => {
        e.preventDefault();
        renderHistoryView();
    });
    templatesNavLink.addEventListener('click', (e) => {
        e.preventDefault();
        renderTemplatesView();
    });
    profileNavLink.addEventListener('click', (e) => {
        e.preventDefault();
        renderProfileView();
    });

    // Modal and signup flow
    signInNavBtn.addEventListener('click', openModal);
    signUpNavBtn.addEventListener('click', openModal);
    closeModalBtn.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) {
            closeModal();
        }
    });
    signUpForm.addEventListener('submit', handleSignUpFormSubmit);

    // Dynamically load the Google Maps API script
    const loadGoogleMapsAPI = () => {
        if (document.querySelector('script[src*="maps.googleapis.com"]')) {
            return; // Script already added
        }
        const script = document.createElement('script');
        script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.API_KEY}&libraries=places&loading=async`;
        script.async = true;
        document.head.appendChild(script);
    };

    loadGoogleMapsAPI();
    
    // Initial render
    renderLandingPage();
}

// Start the app
init();