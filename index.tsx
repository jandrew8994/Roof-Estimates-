
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
type RoofSegment = {
    area: string;
    pitch: string;
    azimuth: string;
};

type Measurements = {
    totalArea: string;
    primaryPitch: string;
    totalRidges: string;
    totalValleys: string;
    totalEaves: string;
    totalRakes: string;
    suggestedWasteFactor: string;
    segments: RoofSegment[];
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

type MeasurementLayout = {
    key: keyof Omit<Measurements, 'segments'>;
    label: string;
    visible: boolean;
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
    layoutConfig?: MeasurementLayout[];
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
const signUpModalOverlay = document.getElementById('signup-modal-overlay') as HTMLDivElement;
const closeModalBtn = document.querySelector('.modal-close-btn') as HTMLButtonElement;
const signUpForm = document.getElementById('signup-form') as HTMLFormElement;


// --- STATE ---
let ai: GoogleGenAI | null = null;
const REPORT_HISTORY_KEY = 'roofReportHistory';
const RECENT_SEARCHES_KEY = 'roofReportRecentSearches';
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

  // --- API Call for Measurements using Google Maps Grounding ---
  const measurementsPromise = ai.models.generateContent({
    model: 'gemini-2.5-flash',
    // FIX: Updated prompt to explicitly request JSON and removed responseSchema/responseMimeType which are not compatible with googleMaps tool.
    contents: `Leveraging the 'Measure My Roof' API, which uses advanced geospatial analysis from Google Maps, provide a detailed roof measurement report for the property at: ${address}. The report should be comprehensive, breaking down the roof into individual segments and providing overall totals. The output MUST be a valid JSON object. The JSON object should have the following properties: 'totalArea' (string), 'primaryPitch' (string), 'totalRidges' (string), 'totalValleys' (string), 'totalEaves' (string), 'totalRakes' (string), 'suggestedWasteFactor' (string), and 'segments' (an array of objects). Each object in the 'segments' array should have 'area' (string), 'pitch' (string), and 'azimuth' (string) properties.`,
    config: {
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

  // FIX: Added robust JSON parsing to handle potential markdown code blocks in the response.
  // Process measurement response
  let measurementsText = measurementResponse.text;
  // The response may be wrapped in a markdown code block, so we extract it.
  const jsonMatch = measurementsText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch && jsonMatch[1]) {
    measurementsText = jsonMatch[1];
  }
  const measurements = JSON.parse(measurementsText);

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
 * Retrieves recent searches from localStorage.
 * @returns An array of address strings.
 */
function getRecentSearches(): string[] {
    const searchesJson = localStorage.getItem(RECENT_SEARCHES_KEY);
    return searchesJson ? JSON.parse(searchesJson) : [];
}

/**
 * Saves a new address to the recent searches list in localStorage.
 * @param address The address to save.
 */
function saveToRecentSearches(address: string) {
    let searches = getRecentSearches();
    // Remove existing instance to move it to the front
    searches = searches.filter(s => s.toLowerCase() !== address.toLowerCase());
    // Add to the front
    searches.unshift(address);
    // Keep only the 5 most recent unique searches
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(searches.slice(0, 5)));
}

/**
 * Saves a new report to the localStorage history.
 * @param report The new report object to save.
 * @returns The newly created report object with ID and timestamp.
 */
function saveReportToHistory(report: Omit<Report, 'id' | 'timestamp' | 'customData' | 'visualizationConfig' | 'layoutConfig'>): Report {
    const history = getReportHistory();
    
    const defaultLayout: MeasurementLayout[] = [
        { label: 'Total Area', key: 'totalArea', visible: true },
        { label: 'Primary Pitch', key: 'primaryPitch', visible: true },
        { label: 'Total Ridges', key: 'totalRidges', visible: true },
        { label: 'Total Valleys', key: 'totalValleys', visible: true },
        { label: 'Total Eaves', key: 'totalEaves', visible: true },
        { label: 'Total Rakes', key: 'totalRakes', visible: true },
        { label: 'Waste Factor', key: 'suggestedWasteFactor', visible: true },
    ];
    
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
        },
        layoutConfig: defaultLayout
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

    saveToRecentSearches(newReport.address);
    
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
    document.getElementById('signup-hero-btn')?.addEventListener('click', () => openModal(signUpModalOverlay));
}


/**
 * Renders the view for entering a property address.
 */
function renderAddressInput() {
    const templates = getTemplates();
    const recentSearches = getRecentSearches();

    const recentSearchesHtml = recentSearches.length > 0 ? `
        <div class="recent-searches-container">
            <h3>Recent Searches</h3>
            <div class="recent-searches-list">
                ${recentSearches.map(address => `<button class="recent-search-item" data-address="${address}">${address}</button>`).join('')}
            </div>
        </div>
    ` : '';

    mainContent.innerHTML = `
        <section class="report-generator-view">
            <div class="container">
                <div class="address-form-container">
                    <h1>Generate a New Roof Report</h1>
                    <p>Enter a property address below, or use your current location.</p>
                    <form id="address-form">
                        <div class="form-group">
                            <label for="address-input">Property Address</label>
                            <div class="address-input-group">
                                <div class="address-input-wrapper">
                                    <svg id="address-input-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                                      <path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
                                    </svg>
                                    <input type="text" id="address-input" placeholder="e.g., 123 Maple St, Anytown, USA" required />
                                </div>
                                <button type="button" id="use-location-btn" class="btn-icon" aria-label="Use my current location">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                                      <path d="M8 16s6-5.686 6-10A6 6 0 0 0 2 6c0 4.314 6 10 6 10zm0-7a3 3 0 1 1 0-6 3 3 0 0 1 0 6z"/>
                                      <path d="M8 0a8 8 0 1 0 0 16A8 8 0 0 0 8 0zM1.5 8a6.5 6.5 0 1 1 13 0 6.5 6.5 0 0 1-13 0z"/>
                                    </svg>
                                </button>
                            </div>
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
                    ${recentSearchesHtml}
                </div>
            </div>
        </section>
    `;

    document.getElementById('address-form')?.addEventListener('submit', handleAddressSubmit);
    document.getElementById('use-location-btn')?.addEventListener('click', handleUseCurrentLocation);
    document.querySelectorAll('.recent-search-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const address = (e.target as HTMLElement).dataset.address;
            if (address) {
                (document.getElementById('address-input') as HTMLInputElement).value = address;
                handleAddressSubmit(new Event('submit', { cancelable: true }));
            }
        });
    });
    
    // --- Initialize Google Maps Autocomplete ---
    const initAutocomplete = () => {
        const addressInput = document.getElementById('address-input') as HTMLInputElement;
        if (!addressInput) return;

        addressInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const isPacVisible = document.querySelector('.pac-container:not([style*="display: none"])');
                if (isPacVisible) e.preventDefault();
            }
        });

        if (window.google?.maps?.places) {
            const autocomplete = new window.google.maps.places.Autocomplete(addressInput, {
                types: ['address'],
                fields: ["formatted_address"]
            });
            autocomplete.addListener('place_changed', () => {
                const place = autocomplete.getPlace();
                if (place?.formatted_address) {
                    const templateSelect = document.getElementById('template-select') as HTMLSelectElement;
                    const templateId = templateSelect.value ? Number(templateSelect.value) : undefined;
                    generateAndDisplayReport(place.formatted_address, templateId);
                }
            });
        } else {
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

    const ridge = measurements.totalRidges || 'N/A';
    const eaves = measurements.totalEaves || 'N/A';
    const rakes = measurements.totalRakes || 'N/A';
    const pitch = measurements.primaryPitch || 'N/A';

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
    const { address, imageUrl, measurements, templateId, customData, visualizationConfig, layoutConfig } = report;
    
    const measurementRows = layoutConfig ?? [];

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

    const segmentsTableHtml = (measurements.segments && measurements.segments.length > 0) ? `
        <h3 class="segments-title">Roof Segments Analysis</h3>
        <table class="measurements-table segments-table">
            <thead>
                <tr>
                    <th>Segment #</th>
                    <th>Area</th>
                    <th>Pitch</th>
                    <th>Direction (Azimuth)</th>
                </tr>
            </thead>
            <tbody>
                ${measurements.segments.map((segment, index) => `
                    <tr>
                        <td><strong>${index + 1}</strong></td>
                        <td>${segment.area || 'N/A'}</td>
                        <td>${segment.pitch || 'N/A'}</td>
                        <td>${segment.azimuth || 'N/A'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` : '';
    
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
                            <tbody id="measurements-tbody">
                                ${measurementRows.filter(row => row.visible).map(row => `
                                    <tr data-key="${row.key}">
                                        <td><strong>${row.label}</strong></td>
                                        <td>
                                            <span class="measurement-value">${(measurements as any)[row.key] || 'N/A'}</span>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        ${segmentsTableHtml}
                    </div>
                </div>
                ${customSectionsHtml}
                <div class="report-actions">
                    <button id="edit-report-btn" class="btn btn-secondary btn-large">Edit Details</button>
                    <button id="share-report-btn" class="btn btn-secondary btn-large">Share</button>
                    <button id="download-pdf-btn" class="btn btn-secondary btn-large">Download PDF</button>
                    <button id="start-new-report-btn" class="btn btn-primary btn-large">Start New Report</button>
                </div>
            </div>
        </section>
    `;
    
    document.getElementById('start-new-report-btn')?.addEventListener('click', renderAddressInput);
    document.getElementById('download-pdf-btn')?.addEventListener('click', () => handleDownloadPdf(report));
    document.getElementById('edit-report-btn')?.addEventListener('click', () => handleToggleEditMode(true, report));
    document.getElementById('share-report-btn')?.addEventListener('click', () => handleShareReport(report));
}


/**
 * Renders a read-only, shared version of a report.
 * @param report The report object to display.
 */
function renderSharedReportView(report: Report) {
    const { address, imageUrl, measurements, templateId, customData, visualizationConfig, layoutConfig } = report;
    document.body.classList.add('shared-view-active');

    const measurementRows = layoutConfig?.filter(r => r.visible) ?? [];

    let customSectionsHtml = '';
    if (templateId) {
        const template = getTemplates().find(t => t.id === templateId);
        if (template && customData) {
            customSectionsHtml = `<div class="custom-sections-container">...</div>`; // Simplified for brevity, similar to renderReportView
        }
    }
    
     const segmentsTableHtml = (measurements.segments && measurements.segments.length > 0) ? `
        <h3 class="segments-title">Roof Segments Analysis</h3>
        <table class="measurements-table segments-table">
            <thead>
                <tr><th>#</th><th>Area</th><th>Pitch</th><th>Direction</th></tr>
            </thead>
            <tbody>
                ${measurements.segments.map((segment, index) => `
                    <tr>
                        <td><strong>${index + 1}</strong></td>
                        <td>${segment.area}</td><td>${segment.pitch}</td><td>${segment.azimuth}</td>
                    </tr>`).join('')}
            </tbody>
        </table>
    ` : '';

    mainContent.innerHTML = `
        <div class="shared-view-header">
            <p>
                <strong>ContractorFlow</strong> Report. 
                <a href="${window.location.origin + window.location.pathname}">Create your own</a>.
            </p>
        </div>
        <section class="report-view" style="animation: none; opacity: 1; padding-top: 1em;">
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
                        <table class="measurements-table">
                            <tbody>
                                ${measurementRows.map(row => `
                                    <tr>
                                        <td><strong>${row.label}</strong></td>
                                        <td><span class="measurement-value">${(measurements as any)[row.key] || 'N/A'}</span></td>
                                    </tr>`).join('')}
                            </tbody>
                        </table>
                         ${segmentsTableHtml}
                    </div>
                </div>
            </div>
        </section>
    `;
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
    let draggedItem: HTMLElement | null = null;

    function getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
        const draggableElements = [...container.querySelectorAll<HTMLElement>('.custom-section-item:not(.dragging)')];

        return draggableElements.reduce((closest, child) => {
            const box = child.getBoundingClientRect();
            const offset = y - box.top - box.height / 2;
            if (offset < 0 && offset > closest.offset) {
                return { offset, element: child };
            } else {
                return closest;
            }
        }, { offset: Number.NEGATIVE_INFINITY, element: null as HTMLElement | null }).element;
    }

    sectionsList.addEventListener('dragstart', e => {
        const target = (e.target as HTMLElement).closest('.custom-section-item');
        if (target) {
            // FIX: Cast the result of 'closest' from Element to HTMLElement to match the type of 'draggedItem'.
            draggedItem = target as HTMLElement;
            // Use setTimeout to allow the browser to create the drag image before applying the class
            setTimeout(() => {
                draggedItem!.classList.add('dragging');
            }, 0);
            document.body.classList.add('dragging-active');
        }
    });

    sectionsList.addEventListener('dragend', () => {
        if (draggedItem) {
            draggedItem.classList.remove('dragging');
        }
        draggedItem = null;
        document.body.classList.remove('dragging-active');
    });

    sectionsList.addEventListener('dragover', e => {
        e.preventDefault(); // This is crucial for drop to work
        if (!draggedItem) return;

        const afterElement = getDragAfterElement(sectionsList, e.clientY);
        if (afterElement == null) {
            sectionsList.appendChild(draggedItem);
        } else {
            sectionsList.insertBefore(draggedItem, afterElement);
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
    const form = document.getElementById('address-form') as HTMLFormElement;
    if (!form) return;
    const input = form.querySelector('#address-input') as HTMLInputElement;
    const templateSelect = form.querySelector('#template-select') as HTMLSelectElement;
    const address = input.value.trim();
    const templateId = templateSelect.value ? Number(templateSelect.value) : undefined;
    generateAndDisplayReport(address, templateId);
}

/**
 * Handles using the browser's geolocation to find and set the user's address.
 * @param e The button click event.
 */
async function handleUseCurrentLocation(e: Event) {
    const button = e.currentTarget as HTMLButtonElement;
    if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
    }
    
    setButtonLoadingState(button, true, ''); // Show spinner inside icon button

    navigator.geolocation.getCurrentPosition(
        (position) => {
            if (!window.google?.maps?.Geocoder) {
                alert("Mapping service not available.");
                setButtonLoadingState(button, false, '');
                return;
            }
            const geocoder = new window.google.maps.Geocoder();
            const latlng = {
                lat: position.coords.latitude,
                lng: position.coords.longitude,
            };
            geocoder.geocode({ location: latlng }, (results, status) => {
                if (status === "OK" && results?.[0]) {
                    const addressInput = document.getElementById('address-input') as HTMLInputElement;
                    addressInput.value = results[0].formatted_address;
                    addressInput.focus();
                } else {
                    alert("Could not determine address from your location. Please try again.");
                }
                setButtonLoadingState(button, false, '');
            });
        },
        () => {
            alert("Unable to retrieve your location. Please ensure location services are enabled in your browser and system settings.");
            setButtonLoadingState(button, false, '');
        }
    );
}

/**
 * Toggles the report view between showing static text and editable input fields.
 * @param isEditing True to switch to edit mode, false to switch back.
 * @param report The report data object.
 */
function handleToggleEditMode(isEditing: boolean, report: Report) {
    const tbody = document.getElementById('measurements-tbody') as HTMLTableSectionElement;
    const editButton = document.getElementById('edit-report-btn') as HTMLButtonElement;
    const downloadButton = document.getElementById('download-pdf-btn') as HTMLButtonElement;
    const shareButton = document.getElementById('share-report-btn') as HTMLButtonElement;
    const visControls = document.getElementById('visualization-controls') as HTMLDivElement;

    if (isEditing) {
        // --- Enter Edit Mode ---
        tbody.innerHTML = (report.layoutConfig ?? []).map(item => `
            <tr data-key="${item.key}" draggable="true" class="${!item.visible ? 'row-hidden' : ''}">
                <td><span class="drag-handle-row" aria-hidden="true">⠿</span></td>
                <td><strong>${item.label}</strong></td>
                <td><input type="text" class="measurement-input" value="${(report.measurements as any)[item.key] || 'N/A'}"></td>
                <td>
                    <button class="visibility-toggle" aria-label="Toggle visibility">
                        ${item.visible ? '👁️' : '🙈'}
                    </button>
                </td>
            </tr>
        `).join('');

        // Add drag and drop listeners
        let draggedItem: HTMLElement | null = null;
        tbody.addEventListener('dragstart', e => {
            draggedItem = e.target as HTMLElement;
            setTimeout(() => draggedItem?.classList.add('dragging'), 0);
        });
        tbody.addEventListener('dragend', () => {
            draggedItem?.classList.remove('dragging');
            draggedItem = null;
        });
        tbody.addEventListener('dragover', e => {
            e.preventDefault();
            // FIX: Changed tbody.children to tbody.rows for proper TypeScript typing of child elements as HTMLTableRowElement.
            const afterElement = [...tbody.rows].find(row => e.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2);
            if(draggedItem) {
                if (afterElement) {
                    tbody.insertBefore(draggedItem, afterElement);
                } else {
                    tbody.appendChild(draggedItem);
                }
            }
        });
        
        // Add visibility toggle listeners
        tbody.querySelectorAll('.visibility-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('tr');
                if(row) {
                    row.classList.toggle('row-hidden');
                    btn.textContent = row.classList.contains('row-hidden') ? '🙈' : '👁️';
                }
            });
        });

        // Custom Sections
        const customSections = document.querySelectorAll<HTMLDivElement>('.custom-section-content');
        customSections.forEach(section => {
            const sectionId = section.dataset.sectionId!;
            const currentContent = report.customData?.[sectionId] || '';
            section.innerHTML = `<textarea class="custom-section-textarea" rows="4">${currentContent}</textarea>`;
        });
        
        // Visualization Controls
        const config = report.visualizationConfig || { fillColor: '#2D3748', strokeColor: '#4A5568', textColor: '#E2E8F0', mutedTextColor: '#A0AEC0' };
        visControls.classList.remove('hidden');
        visControls.innerHTML = `
            <div class="vis-controls-header">
                <h4>Diagram Colors</h4>
                <button id="reset-vis-colors" class="btn-link">Reset to Default</button>
            </div>
            <div class="vis-controls-grid">
                <div class="vis-control">
                    <label for="fill-color">Fill</label>
                    <input type="color" id="fill-color" value="${config.fillColor}">
                </div>
                <div class="vis-control">
                    <label for="stroke-color">Stroke</label>
                    <input type="color" id="stroke-color" value="${config.strokeColor}">
                </div>
                <div class="vis-control">
                    <label for="text-color">Label</label>
                    <input type="color" id="text-color" value="${config.textColor}">
                </div>
                <div class="vis-control">
                    <label for="muted-text-color">Value</label>
                    <input type="color" id="muted-text-color" value="${config.mutedTextColor}">
                </div>
            </div>
        `;

        const updateVis = () => {
            const newConfig: VisualizationConfig = {
                fillColor: (document.getElementById('fill-color') as HTMLInputElement).value,
                strokeColor: (document.getElementById('stroke-color') as HTMLInputElement).value,
                textColor: (document.getElementById('text-color') as HTMLInputElement).value,
                mutedTextColor: (document.getElementById('muted-text-color') as HTMLInputElement).value,
            };
            const visContainer = document.querySelector('.roof-visualization-container');
            if (visContainer) {
                visContainer.innerHTML = createRoofVisualizationSVG(report.measurements, newConfig);
            }
        };

        visControls.querySelectorAll('input[type="color"]').forEach(input => input.addEventListener('input', updateVis));
        document.getElementById('reset-vis-colors')?.addEventListener('click', () => {
            // Reset inputs to default and trigger update
            (document.getElementById('fill-color') as HTMLInputElement).value = '#2D3748';
            (document.getElementById('stroke-color') as HTMLInputElement).value = '#4A5568';
            (document.getElementById('text-color') as HTMLInputElement).value = '#E2E8F0';
            (document.getElementById('muted-text-color') as HTMLInputElement).value = '#A0AEC0';
            updateVis();
        });


        editButton.textContent = 'Save Changes';
        editButton.classList.replace('btn-secondary', 'btn-primary');
        downloadButton.style.display = 'none'; // Hide download while editing
        shareButton.style.display = 'none';

    } else {
        // --- Save Changes and Exit Edit Mode ---
        // Save layout
        const newLayout: MeasurementLayout[] = [];
        tbody.querySelectorAll('tr').forEach(row => {
            const key = row.dataset.key as MeasurementLayout['key'];
            const originalItem = report.layoutConfig?.find(item => item.key === key);
            if (originalItem) {
                newLayout.push({
                    ...originalItem,
                    visible: !row.classList.contains('row-hidden')
                });
            }
        });
        report.layoutConfig = newLayout;
        
        // Save measurement values
        tbody.querySelectorAll<HTMLTableRowElement>('tr[data-key]').forEach(row => {
            const input = row.querySelector('.measurement-input');
            const key = row.dataset.key;
            if (input && key) {
                const value = (input as HTMLInputElement).value;
                (report.measurements as any)[key] = value;
            }
        });


        // Custom Sections
        const customTextareas = document.querySelectorAll<HTMLTextAreaElement>('.custom-section-textarea');
        customTextareas.forEach(textarea => {
            const sectionContentDiv = textarea.parentElement!;
            const sectionId = sectionContentDiv.dataset.sectionId!;
            const content = textarea.value;
            if (!report.customData) report.customData = {};
            report.customData[sectionId] = content;
        });

        // Visualization config
        const newConfig: VisualizationConfig = {
            fillColor: (document.getElementById('fill-color') as HTMLInputElement)?.value || '#2D3748',
            strokeColor: (document.getElementById('stroke-color') as HTMLInputElement)?.value || '#4A5568',
            textColor: (document.getElementById('text-color') as HTMLInputElement)?.value || '#E2E8F0',
            mutedTextColor: (document.getElementById('muted-text-color') as HTMLInputElement)?.value || '#A0AEC0',
        };
        report.visualizationConfig = newConfig;

        updateReportInHistory(report);
        renderReportView(report); // Re-render the whole view to clean up listeners and state
    }
}


/**
 * Generates and triggers a download for a PDF version of the report.
 * @param report The report data to include in the PDF.
 */
async function handleDownloadPdf(report: Report) {
    const { jsPDF } = window.jspdf;
    const autoTable = (window as any).jspdf.plugin.autotable;
    const doc = new jsPDF();
    const profile = getProfileData();
    let finalY = 0;

    // --- PDF Header ---
    if (profile?.logoDataUrl) {
        try {
            // Check if image is a valid format that jsPDF supports (PNG, JPEG)
            const isPng = profile.logoDataUrl.startsWith('data:image/png');
            const isJpeg = profile.logoDataUrl.startsWith('data:image/jpeg');
            if (isPng || isJpeg) {
                 doc.addImage(profile.logoDataUrl, isPng ? 'PNG' : 'JPEG', 14, 15, 30, 15);
            }
        } catch (e) {
            console.error("Error adding logo to PDF:", e);
        }
    }
    if (profile) {
        doc.setFontSize(10);
        doc.text(profile.companyName, 195, 20, { align: 'right' });
        doc.text(profile.companyAddress.replace(/\n/g, ', '), 195, 25, { align: 'right' });
    }
    doc.setLineWidth(0.5);
    doc.line(14, 35, 196, 35);

    // --- Report Title ---
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('Roof Measurement Report', 14, 48);
    doc.setFontSize(12);
    doc.setFont(undefined, 'normal');
    doc.text(`Property: ${report.address}`, 14, 55);
    doc.text(`Date: ${new Date(report.timestamp).toLocaleDateString()}`, 14, 60);

    // --- Satellite Image ---
    try {
        const image = await html2canvas(document.querySelector('.report-image-container img')!, { useCORS: true });
        const imgData = image.toDataURL('image/jpeg', 0.8);
        doc.addImage(imgData, 'JPEG', 14, 70, 85, 85);
    } catch (e) {
        console.error("Error adding satellite image to PDF:", e);
        doc.text("Satellite image could not be loaded.", 14, 70);
    }
    
    // --- Visualization ---
    try {
        // Create an offscreen SVG to render with a white background
        const svgContainer = document.createElement('div');
        svgContainer.style.position = 'absolute';
        svgContainer.style.left = '-9999px';
        svgContainer.innerHTML = createRoofVisualizationSVG(report.measurements, report.visualizationConfig);
        const svgElement = svgContainer.querySelector('svg')!;
        svgElement.style.backgroundColor = 'white'; // Add background for canvas
        document.body.appendChild(svgContainer);
        
        const canvas = await html2canvas(svgElement);
        const imgData = canvas.toDataURL('image/png');
        doc.addImage(imgData, 'PNG', 105, 70, 91, 55);
        document.body.removeChild(svgContainer);

    } catch (e) {
        console.error("Error adding visualization to PDF:", e);
    }

    // --- Measurements Tables ---
    const tableOptions = {
        theme: 'grid',
        headStyles: { fillColor: [45, 55, 72] }, // --light-gray-color
        styles: { cellPadding: 3, fontSize: 10 },
        margin: { left: 105 }
    };
    
    // Use layoutConfig to build the table data, respecting visibility and order
    const mainTableData = (report.layoutConfig ?? [])
      .filter(item => item.visible)
      .map(item => [item.label, (report.measurements as any)[item.key] || 'N/A']);


    autoTable(doc, {
        ...tableOptions,
        startY: 130,
        head: [['Measurement', 'Value']],
        body: mainTableData
    });
    finalY = (doc as any).lastAutoTable.finalY;

    if (report.measurements.segments && report.measurements.segments.length > 0) {
        const segmentsTableData = report.measurements.segments.map((seg, i) => [
            (i + 1).toString(),
            seg.area,
            seg.pitch,
            seg.azimuth
        ]);
        autoTable(doc, {
            ...tableOptions,
            startY: finalY + 8,
            head: [['#', 'Area', 'Pitch', 'Direction']],
            body: segmentsTableData,
            margin: { left: 14 } // Use full width for this table
        });
        finalY = (doc as any).lastAutoTable.finalY;
    }


    // --- Custom Sections ---
    if (report.templateId) {
        const template = getTemplates().find(t => t.id === report.templateId);
        if (template && report.customData) {
            finalY = finalY < 160 ? 165 : finalY + 15; // Ensure we are below image
            doc.setFontSize(14);
            doc.setFont(undefined, 'bold');
            doc.text(`${template.name} - Custom Notes`, 14, finalY);
            finalY += 8;

            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');

            template.customSections.forEach(section => {
                const content = report.customData![section.id];
                if (content) {
                    doc.setFont(undefined, 'bold');
                    doc.text(section.title, 14, finalY);
                    finalY += 5;
                    doc.setFont(undefined, 'normal');
                    const splitText = doc.splitTextToSize(content, 182);
                    doc.text(splitText, 14, finalY);
                    finalY += (splitText.length * 4) + 5; // Approx height
                }
            });
        }
    }

    doc.save(`RoofReport-${report.address.replace(/, /g, '-')}.pdf`);
}

/**
 * Handles generating and displaying the shareable link for a report.
 * @param report The report to share.
 */
function handleShareReport(report: Report) {
    const reportJson = JSON.stringify(report);
    const base64Report = btoa(reportJson); // Encode to Base64
    const shareUrl = `${window.location.origin}${window.location.pathname}#share=${base64Report}`;
    
    const shareModal = document.getElementById('share-modal-overlay') as HTMLDivElement;
    const linkInput = document.getElementById('share-link-input') as HTMLInputElement;
    const copyBtn = document.getElementById('copy-link-btn') as HTMLButtonElement;

    linkInput.value = shareUrl;
    openModal(shareModal);

    const onCopy = () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
            copyBtn.textContent = 'Copied!';
            setTimeout(() => {
                copyBtn.textContent = 'Copy Link';
            }, 2000);
        });
    };
    
    copyBtn.onclick = onCopy;
}



// --- MODAL & NAVIGATION LOGIC ---

/**
 * Opens a specified modal and adds an event listener to close it.
 * @param modal The modal element to open.
 */
function openModal(modal: HTMLElement) {
    modal.classList.remove('hidden');
    document.addEventListener('keydown', handleEscKey);

    const closeModalBtn = modal.querySelector('.modal-close-btn');
    const specificClose = () => closeModal(modal);
    
    closeModalBtn?.addEventListener('click', specificClose);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            specificClose();
        }
    });
}


/**
 * Closes a specified modal and removes the event listener.
 * @param modal The modal element to close.
 */
function closeModal(modal: HTMLElement) {
    modal.classList.add('hidden');
    document.removeEventListener('keydown', handleEscKey);
}

/**
 * Closes the currently open modal if the Escape key is pressed.
 * @param e The KeyboardEvent.
 */
function handleEscKey(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        const openModal = document.querySelector('.modal-overlay:not(.hidden)');
        if (openModal) {
            closeModal(openModal as HTMLElement);
        }
    }
}

/**
 * Handles clicks on the navigation links to render different views.
 * @param view The view to render ('home', 'history', 'templates', 'profile', 'new').
 */
function navigate(view: 'home' | 'history' | 'templates' | 'profile' | 'new') {
    // Reset any active states if needed
    [historyNavLink, templatesNavLink, profileNavLink].forEach(link => link.style.textDecoration = 'none');
     document.body.classList.remove('shared-view-active');
     window.history.pushState({}, '', window.location.pathname); // Clear hash on navigation


    switch(view) {
        case 'history':
            renderHistoryView();
            historyNavLink.style.textDecoration = 'underline';
            break;
        case 'templates':
            renderTemplatesView();
            templatesNavLink.style.textDecoration = 'underline';
            break;
        case 'profile':
            renderProfileView();
            profileNavLink.style.textDecoration = 'underline';
            break;
        case 'new':
            renderAddressInput();
            break;
        case 'home':
        default:
            renderLandingPage();
            break;
    }
}


// --- INITIALIZATION ---

/**
 * Sets up initial event listeners for the application.
 */
function initializeApp() {
    // Check for a shared report link first
    if (window.location.hash.startsWith('#share=')) {
        try {
            const base64Report = window.location.hash.substring(7);
            const reportJson = atob(base64Report);
            const report = JSON.parse(reportJson);
            renderSharedReportView(report);
            return; // Stop further initialization
        } catch (e) {
            console.error("Failed to parse shared report:", e);
            // Fall through to normal app if parsing fails
        }
    }


    // Check if there's any history to decide if we show the link
    if (getReportHistory().length > 0) {
        historyNavLink.classList.remove('hidden');
    }
    // Check for profile data to decide on app state, here we just show the link
    profileNavLink.classList.remove('hidden');
    templatesNavLink.classList.remove('hidden');

    // Simulate "signed in" state
    signInNavBtn.classList.add('hidden');
    signUpNavBtn.classList.add('hidden');

    // Modal listeners
    signUpNavBtn.addEventListener('click', () => openModal(signUpModalOverlay));


    // Form validation
    signUpForm.addEventListener('submit', (e) => {
        e.preventDefault();
        // In a real app, you'd handle form submission here
        alert('Sign-up successful! You can now generate a report.');
        closeModal(signUpModalOverlay);
        // After signup, take user directly to the app
        renderAddressInput();
    });

    // Nav link listeners
    logoLink.addEventListener('click', (e) => { e.preventDefault(); navigate('new'); });
    historyNavLink.addEventListener('click', () => navigate('history'));
    templatesNavLink.addEventListener('click', () => navigate('templates'));
    profileNavLink.addEventListener('click', () => navigate('profile'));
    
    // Initial render
    renderAddressInput();
}


// --- Start the app ---
initializeApp();