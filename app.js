/* ============================================
   GE PROFIT CALCULATOR - APPLICATION LOGIC
   ============================================ */

const API_BASE = 'https://prices.runescape.wiki/api/v1/osrs';
const WIKI_ICON_BASE = 'https://oldschool.runescape.wiki/images';
const USER_AGENT = 'GE Profit Calculator - Personal Use';

// GE Tax constants
const GE_TAX_RATE = 0.02;
const GE_TAX_MIN_PRICE = 50; // Tax only on items > 50gp
const GE_TAX_CAP = 5_000_000; // Max tax per transaction

// Default items
const DEFAULT_BUY_ITEMS = [
    { name: 'Nature rune', id: 561 },
    { name: 'Astral rune', id: 9075, qty: 2 },
    { name: 'Blue dragonhide', id: 1751, qty: 5 }
];

const DEFAULT_SELL_ITEMS = [
    { name: 'Blue dragon leather', id: 2505, qty: 5 }
];

// ============================================
// STATE
// ============================================

let itemMapping = [];       // Full item mapping from API
let latestPrices = {};      // Latest prices keyed by item ID
let buyItems = [];           // Array of { id, qty }
let sellItems = [];          // Array of { id, qty }
let customExpenses = [];     // Array of { id, name, cost, qty }

// ============================================
// API FUNCTIONS
// ============================================

async function fetchMapping() {
    const res = await fetch(`${API_BASE}/mapping`, {
        headers: { 'User-Agent': USER_AGENT }
    });
    return res.json();
}

async function fetchLatestPrices() {
    const res = await fetch(`${API_BASE}/latest`, {
        headers: { 'User-Agent': USER_AGENT }
    });
    const data = await res.json();
    return data.data;
}

async function fetchTimeseries(itemId, timestep = '5m') {
    const res = await fetch(`${API_BASE}/timeseries?timestep=${timestep}&id=${itemId}`, {
        headers: { 'User-Agent': USER_AGENT }
    });
    const data = await res.json();
    return data.data;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatGp(amount) {
    if (amount === null || amount === undefined) return '—';
    const absAmount = Math.abs(amount);
    if (absAmount >= 1_000_000_000) {
        return (amount / 1_000_000_000).toFixed(2) + 'B';
    } else if (absAmount >= 1_000_000) {
        return (amount / 1_000_000).toFixed(2) + 'M';
    } else if (absAmount >= 1_000) {
        return amount.toLocaleString() + ' gp';
    }
    return amount.toLocaleString() + ' gp';
}

function formatNumber(num) {
    if (num === null || num === undefined) return '—';
    return num.toLocaleString();
}

function calculateGETax(sellPrice) {
    if (sellPrice <= GE_TAX_MIN_PRICE) return 0;
    const tax = Math.floor(sellPrice * GE_TAX_RATE);
    return Math.min(tax, GE_TAX_CAP);
}

function getItemIconUrl(iconName) {
    if (!iconName) return '';
    // The OSRS Wiki serves item icons from their image CDN
    const encoded = encodeURIComponent(iconName.replace(/ /g, '_'));
    return `${WIKI_ICON_BASE}/${encoded}`;
}

function getItemById(id) {
    return itemMapping.find(item => item.id === id);
}

function getItemPrice(id) {
    return latestPrices[id] || {};
}

function timeAgo(timestamp) {
    if (!timestamp) return '—';
    const now = Math.floor(Date.now() / 1000);
    const diff = now - timestamp;
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
}

// ============================================
// SEARCH FUNCTIONALITY
// ============================================

function setupSearch(inputId, dropdownId, type) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    let debounceTimer;

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = input.value.trim().toLowerCase();
            if (query.length < 2) {
                dropdown.classList.remove('visible');
                return;
            }
            const results = itemMapping
                .filter(item => item.name && item.name.toLowerCase().includes(query))
                .slice(0, 20);

            if (results.length === 0) {
                dropdown.innerHTML = '<div class="search-dropdown-empty">No items found</div>';
            } else {
                dropdown.innerHTML = results.map(item => `
                    <div class="search-dropdown-item" data-id="${item.id}">
                        <img src="${getItemIconUrl(item.icon)}" alt="${item.name}" onerror="this.style.display='none'">
                        <span class="item-name">${highlightMatch(item.name, query)}</span>
                        <span class="item-id-label">#${item.id}</span>
                    </div>
                `).join('');
            }
            dropdown.classList.add('visible');

            // Click handlers
            dropdown.querySelectorAll('.search-dropdown-item').forEach(el => {
                el.addEventListener('click', () => {
                    const itemId = parseInt(el.dataset.id);
                    addItem(type, itemId);
                    input.value = '';
                    dropdown.classList.remove('visible');
                });
            });
        }, 200);
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !dropdown.contains(e.target)) {
            dropdown.classList.remove('visible');
        }
    });

    // Keyboard navigation
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            dropdown.classList.remove('visible');
            input.blur();
        }
    });
}

function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return text;
    return text.slice(0, idx) + 
           `<strong style="color: var(--accent-gold)">${text.slice(idx, idx + query.length)}</strong>` + 
           text.slice(idx + query.length);
}

// ============================================
// ITEM MANAGEMENT
// ============================================

function addItem(type, itemId, qty = 1) {
    const list = type === 'buy' ? buyItems : sellItems;
    // Don't add duplicates
    if (list.find(i => i.id === itemId)) return;
    list.push({ id: itemId, qty });
    renderItems(type);
    updateSummary();
}

function removeItem(type, itemId) {
    const list = type === 'buy' ? buyItems : sellItems;
    const idx = list.findIndex(i => i.id === itemId);
    if (idx !== -1) {
        list.splice(idx, 1);
        if (type === 'buy') {
            buyItems = list;
        } else {
            sellItems = list;
        }
        renderItems(type);
        updateSummary();
    }
}

function updateQuantity(type, itemId, qty) {
    const list = type === 'buy' ? buyItems : sellItems;
    const item = list.find(i => i.id === itemId);
    if (item) {
        item.qty = Math.max(1, parseInt(qty) || 1);
        updateSummary();
    }
}

// ============================================
// CUSTOM EXPENSES
// ============================================

function addCustomExpense(name, cost, qty = 1) {
    if (!name || !name.trim() || !cost || cost <= 0) return;
    customExpenses.push({
        id: 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
        name: name.trim(),
        cost: Math.floor(parseInt(cost) || 0),
        qty: Math.max(1, parseInt(qty) || 1)
    });
    renderItems('buy');
    updateSummary();
}

function removeCustomExpense(expenseId) {
    customExpenses = customExpenses.filter(e => e.id !== expenseId);
    renderItems('buy');
    updateSummary();
}

function updateCustomExpenseQty(expenseId, qty) {
    const expense = customExpenses.find(e => e.id === expenseId);
    if (expense) {
        expense.qty = Math.max(1, parseInt(qty) || 1);
        updateSummary();
    }
}

// ============================================
// RENDERING
// ============================================

function renderItems(type) {
    const list = type === 'buy' ? buyItems : sellItems;
    const tbody = document.getElementById(type === 'buy' ? 'buyItemsBody' : 'sellItemsBody');
    const emptyState = document.getElementById(type === 'buy' ? 'buyEmptyState' : 'sellEmptyState');
    const countEl = document.getElementById(type === 'buy' ? 'buyItemCount' : 'sellItemCount');
    const table = document.getElementById(type === 'buy' ? 'buyItemsTable' : 'sellItemsTable');

    const totalCount = type === 'buy' ? list.length + customExpenses.length : list.length;
    countEl.textContent = `${totalCount} item${totalCount !== 1 ? 's' : ''}`;

    if (totalCount === 0) {
        table.style.display = 'none';
        emptyState.classList.add('visible');
        return;
    }

    table.style.display = '';
    emptyState.classList.remove('visible');

    tbody.innerHTML = list.map(entry => {
        const item = getItemById(entry.id);
        const price = getItemPrice(entry.id);
        if (!item) return '';

        const instantBuy = price.high || 0;  // "instant buy" = high price (what buyers pay)
        const instantSell = price.low || 0;  // "instant sell" = low price (what sellers get)

        if (type === 'buy') {
            const multiplier = Math.max(1, parseInt(document.getElementById('buyMultiplierInput').value) || 1);
            const effectiveQty = entry.qty * multiplier;
            const totalCost = instantBuy * effectiveQty;
            return `
                <tr>
                    <td class="item-icon-cell" onclick="showItemDetail(${item.id})">
                        <img src="${getItemIconUrl(item.icon)}" alt="${item.name}" onerror="this.style.display='none'">
                    </td>
                    <td class="item-name-cell" onclick="showItemDetail(${item.id})">${item.name}</td>
                    <td class="item-id-cell">#${item.id}</td>
                    <td class="price-cell price-high">${formatGp(instantBuy)}</td>
                    <td class="price-cell price-low">${formatGp(instantSell)}</td>
                    <td>
                        <input type="number" class="quantity-input" value="${entry.qty}" min="1"
                            onchange="updateQuantity('buy', ${item.id}, this.value)"
                            oninput="updateQuantity('buy', ${item.id}, this.value)">
                    </td>
                    <td class="multiplier-cell">x${multiplier}</td>
                    <td class="total-qty-cell">${formatNumber(effectiveQty)}</td>
                    <td class="total-cell">${formatGp(totalCost)}</td>
                    <td class="stats-cell">${formatGp(item.highalch)}</td>
                    <td class="stats-cell">
                        <span class="members-badge ${item.members ? 'members-yes' : 'members-no'}">
                            ${item.members ? 'P2P' : 'F2P'}
                        </span>
                    </td>
                    <td class="stats-cell">${item.limit ? formatNumber(item.limit) : '—'}</td>
                    <td>
                        <button class="remove-btn" onclick="removeItem('buy', ${item.id})" title="Remove item">×</button>
                    </td>
                </tr>
            `;
        } else {
            // Sell items - use instant sell price (low) as revenue since we're selling
            const multiplier = Math.max(1, parseInt(document.getElementById('sellMultiplierInput').value) || 1);
            const effectiveQty = entry.qty * multiplier;
            const sellPricePerItem = instantSell;
            const totalRevenue = sellPricePerItem * effectiveQty;
            const taxPerItem = calculateGETax(sellPricePerItem);
            const totalTax = taxPerItem * effectiveQty;
            const afterTax = totalRevenue - totalTax;

            return `
                <tr>
                    <td class="item-icon-cell" onclick="showItemDetail(${item.id})">
                        <img src="${getItemIconUrl(item.icon)}" alt="${item.name}" onerror="this.style.display='none'">
                    </td>
                    <td class="item-name-cell" onclick="showItemDetail(${item.id})">${item.name}</td>
                    <td class="item-id-cell">#${item.id}</td>
                    <td class="price-cell price-high">${formatGp(instantBuy)}</td>
                    <td class="price-cell price-low">${formatGp(instantSell)}</td>
                    <td>
                        <input type="number" class="quantity-input" value="${entry.qty}" min="1"
                            onchange="updateQuantity('sell', ${item.id}, this.value)"
                            oninput="updateQuantity('sell', ${item.id}, this.value)">
                    </td>
                    <td class="multiplier-cell">x${multiplier}</td>
                    <td class="total-qty-cell">${formatNumber(effectiveQty)}</td>
                    <td class="total-cell">${formatGp(totalRevenue)}</td>
                    <td class="tax-cell">-${formatGp(totalTax)}</td>
                    <td class="total-cell">${formatGp(afterTax)}</td>
                    <td class="stats-cell">${formatGp(item.highalch)}</td>
                    <td class="stats-cell">
                        <span class="members-badge ${item.members ? 'members-yes' : 'members-no'}">
                            ${item.members ? 'P2P' : 'F2P'}
                        </span>
                    </td>
                    <td>
                        <button class="remove-btn" onclick="removeItem('sell', ${item.id})" title="Remove item">×</button>
                    </td>
                </tr>
            `;
        }
    }).join('');

    // Append custom expense rows for buy section
    if (type === 'buy' && customExpenses.length > 0) {
        const multiplier = Math.max(1, parseInt(document.getElementById('buyMultiplierInput').value) || 1);
        tbody.innerHTML += customExpenses.map(expense => {
            const effectiveQty = expense.qty * multiplier;
            const totalCost = expense.cost * effectiveQty;
            return `
                <tr class="custom-expense-row">
                    <td class="item-icon-cell">
                        <div class="custom-expense-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
                                <line x1="7" y1="7" x2="7.01" y2="7"></line>
                            </svg>
                        </div>
                    </td>
                    <td class="item-name-cell custom-name">${expense.name}</td>
                    <td class="item-id-cell"><span class="custom-badge">Custom</span></td>
                    <td class="price-cell price-high">${formatGp(expense.cost)}</td>
                    <td class="price-cell">—</td>
                    <td>
                        <input type="number" class="quantity-input" value="${expense.qty}" min="1"
                            onchange="updateCustomExpenseQty('${expense.id}', this.value)"
                            oninput="updateCustomExpenseQty('${expense.id}', this.value)">
                    </td>
                    <td class="multiplier-cell">x${multiplier}</td>
                    <td class="total-qty-cell">${formatNumber(effectiveQty)}</td>
                    <td class="total-cell">${formatGp(totalCost)}</td>
                    <td class="stats-cell">—</td>
                    <td class="stats-cell">—</td>
                    <td class="stats-cell">—</td>
                    <td>
                        <button class="remove-btn" onclick="removeCustomExpense('${expense.id}')" title="Remove expense">×</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Update section total
    updateSectionTotal(type);
}

function updateSectionTotal(type) {
    const list = type === 'buy' ? buyItems : sellItems;

    if (type === 'buy') {
        const multiplier = Math.max(1, parseInt(document.getElementById('buyMultiplierInput').value) || 1);
        let total = 0;
        list.forEach(entry => {
            const price = getItemPrice(entry.id);
            total += (price.high || 0) * entry.qty * multiplier;
        });
        customExpenses.forEach(e => { total += e.cost * e.qty * multiplier; });
        document.getElementById('totalBuyCost').textContent = formatGp(total);
    } else {
        const multiplier = Math.max(1, parseInt(document.getElementById('sellMultiplierInput').value) || 1);
        let total = 0;
        list.forEach(entry => {
            const price = getItemPrice(entry.id);
            const sellPrice = price.low || 0;
            const tax = calculateGETax(sellPrice);
            total += (sellPrice - tax) * entry.qty * multiplier;
        });
        document.getElementById('totalSellRevenue').textContent = formatGp(total);
    }
}

function updateSummary() {
    let totalBuyCost = 0;
    let totalSellRevenue = 0;
    let totalTax = 0;

    const buyMultiplier = Math.max(1, parseInt(document.getElementById('buyMultiplierInput').value) || 1);
    const sellMultiplier = Math.max(1, parseInt(document.getElementById('sellMultiplierInput').value) || 1);

    buyItems.forEach(entry => {
        const price = getItemPrice(entry.id);
        totalBuyCost += (price.high || 0) * entry.qty * buyMultiplier;
    });
    customExpenses.forEach(e => { totalBuyCost += e.cost * e.qty * buyMultiplier; });

    sellItems.forEach(entry => {
        const price = getItemPrice(entry.id);
        const sellPrice = price.low || 0;
        const revenue = sellPrice * entry.qty * sellMultiplier;
        const taxPerItem = calculateGETax(sellPrice);
        const tax = taxPerItem * entry.qty * sellMultiplier;
        totalSellRevenue += revenue;
        totalTax += tax;
    });

    const afterTaxRevenue = totalSellRevenue - totalTax;
    const netProfit = afterTaxRevenue - totalBuyCost;
    const profitMargin = totalSellRevenue > 0 ? (netProfit / totalSellRevenue) * 100 : 0;
    const roi = totalBuyCost > 0 ? (netProfit / totalBuyCost) * 100 : 0;

    document.getElementById('summaryBuyCost').textContent = formatGp(totalBuyCost);
    document.getElementById('summarySellRevenue').textContent = formatGp(afterTaxRevenue);
    document.getElementById('summaryTax').textContent = formatGp(totalTax);
    
    const profitEl = document.getElementById('summaryProfit');
    profitEl.textContent = (netProfit >= 0 ? '+' : '') + formatGp(netProfit);
    profitEl.classList.toggle('negative', netProfit < 0);

    document.getElementById('summaryMargin').textContent = profitMargin.toFixed(1) + '%';
    document.getElementById('summaryROI').textContent = roi.toFixed(1) + '%';

    // Update section totals
    document.getElementById('totalBuyCost').textContent = formatGp(totalBuyCost);
    document.getElementById('totalSellRevenue').textContent = formatGp(afterTaxRevenue);
}

// ============================================
// ITEM DETAIL MODAL
// ============================================

async function showItemDetail(itemId) {
    const item = getItemById(itemId);
    const price = getItemPrice(itemId);
    if (!item) return;

    const modal = document.getElementById('itemDetailModal');
    
    // Set basic info
    const iconImg = document.getElementById('modalItemIcon');
    iconImg.src = getItemIconUrl(item.icon);
    iconImg.alt = item.name;
    document.getElementById('modalItemName').textContent = item.name;
    document.getElementById('modalItemId').textContent = `Item ID: ${item.id}`;
    document.getElementById('modalExamine').textContent = item.examine || 'No examine text available.';

    // Build stats grid
    const statsGrid = document.getElementById('modalStatsGrid');
    const spread = (price.high && price.low) ? price.high - price.low : null;

    statsGrid.innerHTML = `
        <div class="modal-stat">
            <div class="modal-stat-label">Instant Buy</div>
            <div class="modal-stat-value" style="color: #f87171">${formatGp(price.high)}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Instant Sell</div>
            <div class="modal-stat-value" style="color: #4ade80">${formatGp(price.low)}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Spread</div>
            <div class="modal-stat-value">${spread !== null ? formatGp(spread) : '—'}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">High Alch</div>
            <div class="modal-stat-value">${formatGp(item.highalch)}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Low Alch</div>
            <div class="modal-stat-value">${formatGp(item.lowalch)}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Store Value</div>
            <div class="modal-stat-value">${formatGp(item.value)}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Members</div>
            <div class="modal-stat-value">${item.members ? '✦ P2P' : 'F2P'}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Buy Limit</div>
            <div class="modal-stat-value">${item.limit ? formatNumber(item.limit) : '—'}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">GE Tax</div>
            <div class="modal-stat-value" style="color: var(--color-tax)">${formatGp(calculateGETax(price.low || 0))}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Last Buy</div>
            <div class="modal-stat-value">${timeAgo(price.highTime)}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Last Sell</div>
            <div class="modal-stat-value">${timeAgo(price.lowTime)}</div>
        </div>
        <div class="modal-stat">
            <div class="modal-stat-label">Alch Profit</div>
            <div class="modal-stat-value" style="color: ${(item.highalch - (price.high || 0) - 127) > 0 ? 'var(--color-profit)' : 'var(--color-loss)'}">${formatGp((item.highalch || 0) - (price.high || 0) - 127)}</div>
        </div>
    `;

    // Show modal
    modal.classList.add('visible');

    // Load and draw chart
    try {
        const timeseries = await fetchTimeseries(itemId);
        drawPriceChart(timeseries);
    } catch (err) {
        console.error('Failed to load timeseries:', err);
    }
}

function closeModal() {
    document.getElementById('itemDetailModal').classList.remove('visible');
}

// ============================================
// CHART DRAWING (Canvas)
// ============================================

function drawPriceChart(data) {
    const canvas = document.getElementById('priceChart');
    const ctx = canvas.getContext('2d');

    // Set canvas size for retina
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 12, bottom: 30, left: 55 };

    ctx.clearRect(0, 0, width, height);

    if (!data || data.length === 0) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No price history available', width / 2, height / 2);
        return;
    }

    // Get prices, filter out nulls
    const highPrices = data.map(d => d.avgHighPrice).filter(p => p !== null);
    const lowPrices = data.map(d => d.avgLowPrice).filter(p => p !== null);
    const allPrices = [...highPrices, ...lowPrices];

    if (allPrices.length === 0) {
        ctx.fillStyle = '#6b7280';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No price data available', width / 2, height / 2);
        return;
    }

    const minPrice = Math.min(...allPrices);
    const maxPrice = Math.max(...allPrices);
    const priceRange = maxPrice - minPrice || 1;

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    function xPos(i) {
        return padding.left + (i / (data.length - 1)) * chartWidth;
    }

    function yPos(price) {
        return padding.top + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
    }

    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding.top + (i / gridLines) * chartHeight;
        ctx.beginPath();
        ctx.moveTo(padding.left, y);
        ctx.lineTo(width - padding.right, y);
        ctx.stroke();

        // Price labels
        const price = maxPrice - (i / gridLines) * priceRange;
        ctx.fillStyle = '#6b7280';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(formatGp(Math.round(price)), padding.left - 8, y + 3);
    }

    // Draw high price line (buyers pay)
    ctx.beginPath();
    ctx.strokeStyle = '#f87171';
    ctx.lineWidth = 1.5;
    let started = false;
    data.forEach((d, i) => {
        if (d.avgHighPrice !== null) {
            const x = xPos(i);
            const y = yPos(d.avgHighPrice);
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
    });
    ctx.stroke();

    // High price gradient fill
    if (started) {
        ctx.lineTo(xPos(data.length - 1), padding.top + chartHeight);
        ctx.lineTo(xPos(0), padding.top + chartHeight);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
        grad.addColorStop(0, 'rgba(248, 113, 113, 0.1)');
        grad.addColorStop(1, 'rgba(248, 113, 113, 0)');
        ctx.fillStyle = grad;
        ctx.fill();
    }

    // Draw low price line (sellers get)
    ctx.beginPath();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    started = false;
    data.forEach((d, i) => {
        if (d.avgLowPrice !== null) {
            const x = xPos(i);
            const y = yPos(d.avgLowPrice);
            if (!started) {
                ctx.moveTo(x, y);
                started = true;
            } else {
                ctx.lineTo(x, y);
            }
        }
    });
    ctx.stroke();

    // Low price gradient fill
    if (started) {
        ctx.lineTo(xPos(data.length - 1), padding.top + chartHeight);
        ctx.lineTo(xPos(0), padding.top + chartHeight);
        ctx.closePath();
        const grad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
        grad.addColorStop(0, 'rgba(74, 222, 128, 0.08)');
        grad.addColorStop(1, 'rgba(74, 222, 128, 0)');
        ctx.fillStyle = grad;
        ctx.fill();
    }

    // Legend
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'left';

    ctx.fillStyle = '#f87171';
    ctx.fillRect(padding.left, height - 12, 12, 3);
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Instant Buy', padding.left + 16, height - 8);

    ctx.fillStyle = '#4ade80';
    ctx.fillRect(padding.left + 100, height - 12, 12, 3);
    ctx.fillStyle = '#9ca3af';
    ctx.fillText('Instant Sell', padding.left + 116, height - 8);
}

// ============================================
// PRESETS (localStorage)
// ============================================

const PRESETS_STORAGE_KEY = 'ge_calc_presets';

function getPresets() {
    try {
        const raw = localStorage.getItem(PRESETS_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

function savePresetsToStorage(presets) {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
}

function savePreset(name) {
    if (!name || !name.trim()) return false;
    const presets = getPresets();
    const trimmedName = name.trim();

    // Check if preset with same name exists — overwrite it
    const existingIdx = presets.findIndex(p => p.name.toLowerCase() === trimmedName.toLowerCase());

    const preset = {
        id: existingIdx !== -1 ? presets[existingIdx].id : Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        name: trimmedName,
        buyItems: buyItems.map(i => ({ id: i.id, qty: i.qty })),
        sellItems: sellItems.map(i => ({ id: i.id, qty: i.qty })),
        customExpenses: customExpenses.map(e => ({ id: e.id, name: e.name, cost: e.cost, qty: e.qty })),
        buyMultiplier: parseInt(document.getElementById('buyMultiplierInput').value) || 1,
        sellMultiplier: parseInt(document.getElementById('sellMultiplierInput').value) || 1,
        savedAt: Date.now()
    };

    if (existingIdx !== -1) {
        presets[existingIdx] = preset;
    } else {
        presets.push(preset);
    }

    savePresetsToStorage(presets);
    renderPresetsDropdown();
    document.getElementById('presetSelect').value = preset.id;
    updatePresetButtonStates();
    return true;
}

function loadPreset(presetId) {
    const presets = getPresets();
    const preset = presets.find(p => p.id === presetId);
    if (!preset) return;

    // Clear and replace current items
    buyItems.length = 0;
    sellItems.length = 0;
    customExpenses.length = 0;
    preset.buyItems.forEach(i => buyItems.push({ id: i.id, qty: i.qty }));
    preset.sellItems.forEach(i => sellItems.push({ id: i.id, qty: i.qty }));
    if (preset.customExpenses) {
        preset.customExpenses.forEach(e => customExpenses.push({ id: e.id, name: e.name, cost: e.cost, qty: e.qty }));
    }

    document.getElementById('buyMultiplierInput').value = preset.buyMultiplier || 1;
    document.getElementById('sellMultiplierInput').value = preset.sellMultiplier || 1;

    renderItems('buy');
    renderItems('sell');
    updateSummary();
}

function deletePreset(presetId) {
    let presets = getPresets();
    presets = presets.filter(p => p.id !== presetId);
    savePresetsToStorage(presets);
    renderPresetsDropdown();
    updatePresetButtonStates();
}

function renderPresetsDropdown() {
    const select = document.getElementById('presetSelect');
    const presets = getPresets();
    const countEl = document.getElementById('presetCount');

    countEl.textContent = `${presets.length} saved`;

    select.innerHTML = '<option value="">Select a preset...</option>' +
        presets.map(p => {
            const buyCount = p.buyItems.length;
            const sellCount = p.sellItems.length;
            return `<option value="${p.id}">${p.name} (${buyCount}B / ${sellCount}S)</option>`;
        }).join('');
}

function updatePresetButtonStates() {
    const select = document.getElementById('presetSelect');
    const hasSelection = !!select.value;
    document.getElementById('loadPresetBtn').disabled = !hasSelection;
    document.getElementById('deletePresetBtn').disabled = !hasSelection;
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast toast-${type} visible`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
        toast.classList.remove('visible');
    }, 2500);
}

function setupPresets() {
    renderPresetsDropdown();
    updatePresetButtonStates();

    const select = document.getElementById('presetSelect');
    select.addEventListener('change', updatePresetButtonStates);

    document.getElementById('savePresetBtn').addEventListener('click', () => {
        const input = document.getElementById('presetNameInput');
        const name = input.value.trim();
        if (!name) {
            input.focus();
            input.classList.add('shake');
            setTimeout(() => input.classList.remove('shake'), 500);
            return;
        }
        if (buyItems.length === 0 && sellItems.length === 0 && customExpenses.length === 0) {
            showToast('Add items before saving', 'warning');
            return;
        }
        const presets = getPresets();
        const existing = presets.find(p => p.name.toLowerCase() === name.toLowerCase());
        savePreset(name);
        showToast(existing ? `Preset "${name}" updated!` : `Preset "${name}" saved!`);
        input.value = '';
    });

    document.getElementById('loadPresetBtn').addEventListener('click', () => {
        if (select.value) {
            loadPreset(select.value);
            const option = select.options[select.selectedIndex];
            showToast(`Loaded "${option.text.split(' (')[0]}"`);
        }
    });

    document.getElementById('deletePresetBtn').addEventListener('click', () => {
        if (select.value) {
            const option = select.options[select.selectedIndex];
            const name = option.text.split(' (')[0];
            deletePreset(select.value);
            showToast(`Deleted "${name}"`, 'warning');
        }
    });

    document.getElementById('presetNameInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('savePresetBtn').click();
        }
    });
}

function setupExpenseForm() {
    const nameInput = document.getElementById('expenseName');
    const costInput = document.getElementById('expenseCost');
    const addBtn = document.getElementById('addExpenseBtn');

    const handleAdd = () => {
        const name = nameInput.value.trim();
        const cost = parseInt(costInput.value);

        if (!name) {
            nameInput.classList.add('shake');
            setTimeout(() => nameInput.classList.remove('shake'), 500);
            return;
        }

        if (isNaN(cost) || cost <= 0) {
            costInput.classList.add('shake');
            setTimeout(() => costInput.classList.remove('shake'), 500);
            return;
        }

        addCustomExpense(name, cost, 1);
        nameInput.value = '';
        costInput.value = '';
        nameInput.focus();
    };

    addBtn.addEventListener('click', handleAdd);

    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleAdd();
        }
    });

    costInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            handleAdd();
        }
    });
}

// ============================================
// INITIALIZATION
// ============================================

async function init() {
    const loadingOverlay = document.getElementById('loadingOverlay');

    try {
        // Fetch data in parallel
        const [mapping, prices] = await Promise.all([
            fetchMapping(),
            fetchLatestPrices()
        ]);

        itemMapping = mapping;
        latestPrices = prices;

        // Update items loaded count
        document.getElementById('itemsLoadedCount').textContent = itemMapping.length.toLocaleString();

        // Setup search
        setupSearch('buySearchInput', 'buySearchDropdown', 'buy');
        setupSearch('sellSearchInput', 'sellSearchDropdown', 'sell');

        // Setup multipliers
        document.getElementById('buyMultiplierInput').addEventListener('input', () => {
            renderItems('buy');
            updateSummary();
        });

        document.getElementById('sellMultiplierInput').addEventListener('input', () => {
            renderItems('sell');
            updateSummary();
        });

        // Setup presets
        setupPresets();

        // Add default items
        DEFAULT_BUY_ITEMS.forEach(item => addItem('buy', item.id, item.qty || 1));
        DEFAULT_SELL_ITEMS.forEach(item => addItem('sell', item.id, item.qty || 1));

        // Setup custom expense form
        setupExpenseForm();

        // Setup modal
        document.getElementById('modalClose').addEventListener('click', closeModal);
        document.getElementById('itemDetailModal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('itemDetailModal')) {
                closeModal();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') closeModal();
        });

        // Refresh button
        document.getElementById('refreshBtn').addEventListener('click', refreshPrices);

        // Hide loading
        loadingOverlay.classList.add('hidden');

    } catch (err) {
        console.error('Failed to initialize:', err);
        document.querySelector('.loader-text').textContent = 'Failed to load data. Please refresh the page.';
    }
}

async function refreshPrices() {
    const btn = document.getElementById('refreshBtn');
    btn.classList.add('spinning');

    try {
        latestPrices = await fetchLatestPrices();
        renderItems('buy');
        renderItems('sell');
        updateSummary();
    } catch (err) {
        console.error('Failed to refresh prices:', err);
    } finally {
        setTimeout(() => btn.classList.remove('spinning'), 500);
    }
}

// Start the app
document.addEventListener('DOMContentLoaded', init);
