// Define interfaces for our data structures
interface LineItem {
  description: string;
  quantity: number;
  rate: number;
}

interface Quote {
  id: number;
  clientName: string;
  clientAddress: string;
  clientEmail: string;
  projectTitle: string;
  lineItems: LineItem[];
  total: number;
}


// --- DOM ELEMENT REFERENCES ---
const mainContent = document.getElementById('main-content') as HTMLElement;
const signUpNavBtn = document.getElementById('signup-nav-btn') as HTMLButtonElement;
const signUpHeroBtn = document.getElementById('signup-hero-btn') as HTMLButtonElement;
const modalOverlay = document.getElementById('signup-modal-overlay') as HTMLDivElement;
const closeModalBtn = document.querySelector('.modal-close-btn') as HTMLButtonElement;
const signUpForm = document.getElementById('signup-form') as HTMLFormElement;

// --- LOCALSTORAGE HELPERS ---
function getQuotesFromStorage(): Quote[] {
  const quotesJSON = localStorage.getItem('contractorQuotes');
  return quotesJSON ? JSON.parse(quotesJSON) : [];
}

function saveQuotesToStorage(quotes: Quote[]): void {
  localStorage.setItem('contractorQuotes', JSON.stringify(quotes));
}


// --- MODAL LOGIC ---
function openModal() {
  modalOverlay.classList.remove('hidden');
}

function closeModal() {
  modalOverlay.classList.add('hidden');
}


// --- UI RENDERING FUNCTIONS ---

/**
 * Renders the list of saved quotes.
 */
function renderQuotesList() {
    const quotes = getQuotesFromStorage();
    const quotesListContainer = document.getElementById('quotes-list');
    if (!quotesListContainer) return;

    if (quotes.length === 0) {
        quotesListContainer.innerHTML = '<p>No quotes created yet.</p>';
        return;
    }

    quotesListContainer.innerHTML = quotes.map(quote => `
        <div class="quote-item">
            <div class="quote-item-details">
                <strong>${quote.projectTitle}</strong><br>
                <span>For: ${quote.clientName}</span>
            </div>
            <div class="quote-item-total">
                $${quote.total.toFixed(2)}
            </div>
        </div>
    `).join('');
}


/**
 * Renders the main dashboard view.
 */
function renderDashboard() {
  const userName = localStorage.getItem('contractorUserName') || 'User';
  const firstName = userName.split(' ')[0];
  mainContent.innerHTML = `
    <section class="dashboard container">
      <h1>Welcome, ${firstName}!</h1>
      <button class="btn btn-primary btn-large" id="create-quote-btn">Create New Quote</button>
      <div id="quotes-list-container">
        <h2>Your Quotes</h2>
        <div id="quotes-list"></div>
      </div>
    </section>
  `;

  renderQuotesList();

  document.getElementById('create-quote-btn')?.addEventListener('click', renderQuoteCreator);
}

/**
 * Renders the UI for creating a new quote.
 */
function renderQuoteCreator() {
    mainContent.innerHTML = `
        <section class="quote-creator container">
            <h1>Create New Quote</h1>
            <form id="quote-form">
                <div class="form-section">
                    <h2>Client Information</h2>
                    <div class="form-grid">
                        <div class="form-group">
                            <label for="client-name">Client Name</label>
                            <input type="text" id="client-name" required />
                        </div>
                        <div class="form-group">
                            <label for="client-address">Client Address</label>
                            <input type="text" id="client-address" required />
                        </div>
                         <div class="form-group">
                            <label for="client-email">Client Email</label>
                            <input type="email" id="client-email" required />
                        </div>
                    </div>
                </div>

                <div class="form-section">
                    <h2>Project Details</h2>
                     <div class="form-group">
                        <label for="project-title">Project Title</label>
                        <input type="text" id="project-title" required />
                    </div>
                </div>

                <div class="form-section">
                    <h2>Line Items</h2>
                    <div id="line-items-container">
                        <div class="line-item-header">
                            <div>Description</div>
                            <div>Qty</div>
                            <div>Rate</div>
                            <div>Total</div>
                            <div></div>
                        </div>
                        <!-- Line items will be injected here -->
                    </div>
                    <button type="button" class="btn" id="add-item-btn">+ Add Item</button>
                </div>
                
                <div class="quote-summary">
                    <div id="grand-total">Total: $0.00</div>
                </div>

                <div class="quote-actions">
                    <button type="button" class="btn" id="back-to-dashboard-btn">Back to Dashboard</button>
                    <button type="submit" class="btn btn-primary">Save Quote</button>
                </div>
            </form>
        </section>
    `;

    const lineItemsContainer = document.getElementById('line-items-container')!;
    const addItemBtn = document.getElementById('add-item-btn')!;
    const quoteForm = document.getElementById('quote-form')!;

    function addLineItem() {
        const itemDiv = document.createElement('div');
        itemDiv.classList.add('line-item');
        itemDiv.innerHTML = `
            <div><input type="text" class="item-description" placeholder="Service or item description" required /></div>
            <div><input type="number" class="item-quantity" value="1" min="0" step="any" required /></div>
            <div><input type="number" class="item-rate" placeholder="0.00" min="0" step="0.01" required /></div>
            <div class="line-item-total">$0.00</div>
            <div><button type="button" class="remove-item-btn">&times;</button></div>
        `;
        lineItemsContainer.appendChild(itemDiv);
    }
    
    function updateTotals() {
        let grandTotal = 0;
        document.querySelectorAll('.line-item').forEach(item => {
            const quantity = (item.querySelector('.item-quantity') as HTMLInputElement).valueAsNumber || 0;
            const rate = (item.querySelector('.item-rate') as HTMLInputElement).valueAsNumber || 0;
            const total = quantity * rate;
            (item.querySelector('.line-item-total') as HTMLElement).textContent = `$${total.toFixed(2)}`;
            grandTotal += total;
        });
        (document.getElementById('grand-total') as HTMLElement).textContent = `Total: $${grandTotal.toFixed(2)}`;
    }

    lineItemsContainer.addEventListener('input', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.classList.contains('item-quantity') || target.classList.contains('item-rate')) {
            updateTotals();
        }
    });

    lineItemsContainer.addEventListener('click', (e) => {
        const target = e.target as HTMLButtonElement;
        if (target.classList.contains('remove-item-btn')) {
            target.closest('.line-item')?.remove();
            updateTotals();
        }
    });
    
    addItemBtn.addEventListener('click', addLineItem);

    quoteForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const quotes = getQuotesFromStorage();
        const lineItems: LineItem[] = [];
        let total = 0;

        document.querySelectorAll('.line-item').forEach(item => {
            const description = (item.querySelector('.item-description') as HTMLInputElement).value;
            const quantity = (item.querySelector('.item-quantity') as HTMLInputElement).valueAsNumber;
            const rate = (item.querySelector('.item-rate') as HTMLInputElement).valueAsNumber;
            lineItems.push({ description, quantity, rate });
            total += quantity * rate;
        });

        if (lineItems.length === 0) {
            alert('Please add at least one line item to the quote.');
            return;
        }

        const newQuote: Quote = {
            id: Date.now(),
            clientName: (document.getElementById('client-name') as HTMLInputElement).value,
            clientAddress: (document.getElementById('client-address') as HTMLInputElement).value,
            clientEmail: (document.getElementById('client-email') as HTMLInputElement).value,
            projectTitle: (document.getElementById('project-title') as HTMLInputElement).value,
            lineItems,
            total,
        };

        quotes.push(newQuote);
        saveQuotesToStorage(quotes);
        
        renderDashboard();
    });
    
    document.getElementById('back-to-dashboard-btn')?.addEventListener('click', renderDashboard);

    // Add one line item to start and initialize totals
    addLineItem();
    updateTotals();
}


// --- EVENT LISTENERS ---

// Event listener for the sign-up form submission
signUpForm.addEventListener('submit', (e) => {
  e.preventDefault(); 

  const nameInput = document.getElementById('full-name') as HTMLInputElement;
  const userName = nameInput.value.trim();
  
  // Store user name to persist "session"
  localStorage.setItem('contractorUserName', userName);

  closeModal();

  renderDashboard();
});

// Add event listeners to buttons that open the modal
signUpNavBtn.addEventListener('click', openModal);
signUpHeroBtn.addEventListener('click', openModal);

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
