// Initialize Dexie.js Database
const db = new Dexie("DKPOSDatabase");

// Schema definition
db.version(1).stores({
    products: '++id, name, category, costPrice, sellingPrice, stockQuantity, vendorId',
    vendors: '++id, name, contactNumber',
    sales: '++id, timestamp, totalAmount, discount, *itemsOrdered'
});
db.version(2).stores({
    sales: '++id, timestamp, totalAmount, discount' // Removed invalid *itemsOrdered index
});
db.version(3).stores({
    returns: '++id, timestamp, productId, productName, qty, refundAmount, costPrice'
});

// Global State
let currentCart = [];
let allProducts = [];
let globalCategories = new Set();
let activeCategory = 'all';

// DOM Elements Initialization
document.addEventListener('DOMContentLoaded', async () => {
    initNavigation();
    initModals();
    await loadInitialData();
    setupEventListeners();
});

// ==========================================
// 1. NAVIGATION & UI LOGIC
// ==========================================
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.content-section');

    navButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();

            // Remove active from all navs
            navButtons.forEach(b => {
                b.classList.remove('active', 'text-brand-600', 'bg-brand-50');
                b.classList.add('text-gray-500');
                const icon = b.querySelector('i');
                icon.classList.remove('text-brand-600');
            });

            // Add active to clicked nav
            btn.classList.add('active', 'text-brand-600', 'bg-brand-50');
            btn.classList.remove('text-gray-500');
            const icon = btn.querySelector('i');
            icon.classList.add('text-brand-600');

            // Hide all sections
            sections.forEach(sec => sec.classList.remove('active-section'));

            // Show target section
            const targetId = btn.getAttribute('data-target');
            document.getElementById(targetId).classList.add('active-section');

            // Refresh data based on view
            refreshCurrentView(targetId);
        });
    });
}

function switchTab(sectionId) {
    const navBtn = document.querySelector(`.nav-btn[data-target="${sectionId}"]`);
    if (navBtn) navBtn.click();
}

function refreshCurrentView(sectionId) {
    if (sectionId === 'inventory-section') loadInventory();
    else if (sectionId === 'vendors-section') loadVendors();
    else if (sectionId === 'pos-section') loadPOSProducts();
    else if (sectionId === 'dashboard-section') loadDashboard();
    else if (sectionId === 'returns-section') loadReturns();
}

// Toasts
function showToast(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');

    // Style based on type
    const colors = type === 'success'
        ? 'bg-green-100 text-green-800 border-green-200'
        : type === 'error'
            ? 'bg-red-100 text-red-800 border-red-200'
            : 'bg-blue-100 text-blue-800 border-blue-200';

    const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';

    toast.className = `flex items-center p-4 mb-2 rounded-lg border shadow-sm ${colors} transform transition-all duration-300 translate-x-full`;
    toast.innerHTML = `
        <i class="fas ${icon} text-lg mr-3"></i>
        <div class="text-sm font-medium">${message}</div>
    `;

    container.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full');
    });

    // Remove after 3s
    setTimeout(() => {
        toast.classList.add('opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ==========================================
// 2. MODAL LOGIC
// ==========================================
function initModals() {
    // Margin calculator
    document.getElementById('calc-price-btn').addEventListener('click', () => {
        const cost = parseFloat(document.getElementById('product-cost').value);
        const margin = parseFloat(document.getElementById('product-margin').value);
        if (!isNaN(cost) && !isNaN(margin)) {
            const sellingPrice = cost + (cost * (margin / 100));
            document.getElementById('product-selling').value = sellingPrice.toFixed(2);
        }
    });
}

function openModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('hidden');
    // small delay for transition
    setTimeout(() => modal.classList.add('modal-active'), 10);

    if (id === 'product-modal') {
        populateVendorDropdownOptions();
    }
}

function closeModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('modal-active');
    setTimeout(() => {
        modal.classList.add('hidden');
        // Reset form if exists
        const form = modal.querySelector('form');
        if (form) form.reset();
        document.getElementById('product-id').value = '';
        document.getElementById('product-modal-title').innerText = 'Add New Product';
        document.getElementById('vendor-id').value = '';
        document.getElementById('vendor-modal-title').innerText = 'Add New Vendor';
    }, 300);
}

// ==========================================
// 3. DATABASE OPERATIONS (CRUD)
// ==========================================

async function loadInitialData() {
    await loadPOSProducts();
    await loadDashboard();
}

async function populateVendorDropdownOptions() {
    const vendors = await db.vendors.toArray();
    const select = document.getElementById('product-vendor');
    select.innerHTML = '<option value="">Select a vendor...</option>';
    vendors.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        select.appendChild(opt);
    });
}

// --- VENDORS ---
document.getElementById('vendor-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('vendor-id').value;
    const data = {
        name: document.getElementById('vendor-name').value.trim(),
        contactNumber: document.getElementById('vendor-contact').value.trim()
    };

    try {
        if (id) {
            await db.vendors.update(parseInt(id), data);
            showToast('Vendor updated successfully');
        } else {
            await db.vendors.add(data);
            showToast('Vendor added successfully');
        }
        closeModal('vendor-modal');
        loadVendors();
    } catch (err) {
        showToast('Error saving vendor', 'error');
        console.error(err);
    }
});

async function loadVendors() {
    const vendors = await db.vendors.toArray();
    const tbody = document.getElementById('vendors-table-body');
    tbody.innerHTML = '';

    if (vendors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center text-gray-500">No vendors found. Add one to get started.</td></tr>';
        return;
    }

    vendors.forEach(v => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-gray-800">${v.name}</td>
            <td class="px-6 py-4 text-gray-600">${v.contactNumber || '-'}</td>
            <td class="px-6 py-4 text-center">
                <button onclick="editVendor(${v.id})" class="text-blue-500 hover:text-blue-700 mx-1"><i class="fas fa-edit"></i></button>
                <button onclick="deleteVendor(${v.id})" class="text-red-500 hover:text-red-700 mx-1"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

async function editVendor(id) {
    const v = await db.vendors.get(id);
    if (!v) return;
    document.getElementById('vendor-id').value = v.id;
    document.getElementById('vendor-name').value = v.name;
    document.getElementById('vendor-contact').value = v.contactNumber;
    document.getElementById('vendor-modal-title').innerText = 'Edit Vendor';
    openModal('vendor-modal');
}

async function deleteVendor(id) {
    if (confirm('Are you sure you want to delete this vendor?')) {
        await db.vendors.delete(id);
        showToast('Vendor deleted');
        loadVendors();
    }
}

// --- PRODUCTS ---
document.getElementById('product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('product-id').value;
    const cat = document.getElementById('product-category').value.trim();

    // Auto-update global categories set (will reflect in POS)
    if (cat) globalCategories.add(cat);

    const data = {
        name: document.getElementById('product-name').value.trim(),
        category: cat,
        unit: document.getElementById('product-unit').value,
        vendorId: document.getElementById('product-vendor').value || null,
        stockQuantity: parseFloat(document.getElementById('product-stock').value),
        costPrice: parseFloat(document.getElementById('product-cost').value),
        sellingPrice: parseFloat(document.getElementById('product-selling').value)
    };

    try {
        if (id) {
            await db.products.update(parseInt(id), data);
            showToast('Product updated successfully');
        } else {
            await db.products.add(data);
            showToast('Product added successfully');
        }
        closeModal('product-modal');
        loadInventory();
        loadPOSProducts(); // Refresh POS list
    } catch (err) {
        showToast('Error saving product', 'error');
        console.error(err);
    }
});

async function loadInventory(searchTerm = '') {
    let products = await db.products.toArray();

    if (searchTerm) {
        searchTerm = searchTerm.toLowerCase();
        products = products.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            p.category.toLowerCase().includes(searchTerm)
        );
    }

    const tbody = document.getElementById('inventory-table-body');
    tbody.innerHTML = '';

    if (products.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-4 text-center text-gray-500">No products found.</td></tr>';
        return;
    }

    products.forEach(p => {
        const stockClass = p.stockQuantity < 5 ? 'text-red-600 font-bold bg-red-50 px-2 py-1 rounded' : 'text-gray-800';

        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-50/50 transition-colors';
        tr.innerHTML = `
            <td class="px-6 py-4 font-medium text-gray-800">${p.name}</td>
            <td class="px-6 py-4">
                <span class="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium">${p.category}</span>
            </td>
            <td class="px-6 py-4 text-right"><span class="${stockClass}">${p.stockQuantity} ${p.unit}</span></td>
            <td class="px-6 py-4 text-right text-gray-600">Rs. ${p.costPrice.toFixed(2)}</td>
            <td class="px-6 py-4 text-right font-medium text-brand-600">Rs. ${p.sellingPrice.toFixed(2)}</td>
            <td class="px-6 py-4 text-center">
                <button onclick="editProduct(${p.id})" class="text-blue-500 hover:text-blue-700 mx-2 p-1 bg-blue-50 rounded"><i class="fas fa-edit"></i></button>
                <button onclick="deleteProduct(${p.id})" class="text-red-500 hover:text-red-700 mx-2 p-1 bg-red-50 rounded"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

document.getElementById('inventory-search').addEventListener('input', (e) => {
    loadInventory(e.target.value);
});

async function editProduct(id) {
    const p = await db.products.get(id);
    if (!p) return;

    document.getElementById('product-id').value = p.id;
    document.getElementById('product-name').value = p.name;
    document.getElementById('product-category').value = p.category;
    document.getElementById('product-unit').value = p.unit || 'Meters';

    await populateVendorDropdownOptions();
    if (p.vendorId) document.getElementById('product-vendor').value = p.vendorId;

    document.getElementById('product-stock').value = p.stockQuantity;
    document.getElementById('product-cost').value = p.costPrice;
    document.getElementById('product-selling').value = p.sellingPrice;

    document.getElementById('product-modal-title').innerText = 'Edit Product';
    openModal('product-modal');
}

async function deleteProduct(id) {
    if (confirm('Are you sure you want to delete this product?')) {
        await db.products.delete(id);
        showToast('Product deleted');
        loadInventory();
        loadPOSProducts();
    }
}

// ==========================================
// 4. POS (POINT OF SALE) LOGIC
// ==========================================

async function loadPOSProducts(searchTerm = '') {
    allProducts = await db.products.toArray();
    globalCategories.clear();

    allProducts.forEach(p => {
        if (p.category) globalCategories.add(p.category);
    });

    renderPOSCategories();
    renderPOSGrid(searchTerm);
}

function renderPOSCategories() {
    const container = document.getElementById('pos-categories');
    container.innerHTML = `<button class="px-4 py-1.5 rounded-full ${activeCategory === 'all' ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-200'} text-sm font-medium whitespace-nowrap transition-colors" onclick="setPOSCategory('all')">All</button>`;

    Array.from(globalCategories).sort().forEach(cat => {
        const isAct = activeCategory === cat;
        const btnClass = isAct ? 'bg-brand-600 text-white' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50';
        container.innerHTML += `<button class="px-4 py-1.5 rounded-full ${btnClass} text-sm font-medium whitespace-nowrap transition-colors" onclick="setPOSCategory('${cat}')">${cat}</button>`;
    });
}

function setPOSCategory(cat) {
    activeCategory = cat;
    renderPOSCategories(); // update active state
    renderPOSGrid(document.getElementById('pos-search').value);
}

document.getElementById('pos-search').addEventListener('input', (e) => {
    renderPOSGrid(e.target.value);
});

function renderPOSGrid(searchTerm = '') {
    const container = document.getElementById('pos-product-list');
    container.innerHTML = '';

    let filtered = allProducts;

    // Filter by Category
    if (activeCategory !== 'all') {
        filtered = filtered.filter(p => p.category === activeCategory);
    }

    // Filter by Search
    if (searchTerm) {
        searchTerm = searchTerm.toLowerCase();
        filtered = filtered.filter(p =>
            p.name.toLowerCase().includes(searchTerm) ||
            p.category.toLowerCase().includes(searchTerm)
        );
    }

    if (filtered.length === 0) {
        container.innerHTML = '<div class="col-span-full h-40 flex items-center justify-center text-gray-400">No products found</div>';
        return;
    }

    filtered.forEach(p => {
        const isOutOfStock = p.stockQuantity <= 0;
        const card = document.createElement('div');
        card.className = `product-card bg-white rounded-xl border border-gray-100 p-4 cursor-pointer relative overflow-hidden flex flex-col justify-between h-32 ${isOutOfStock ? 'opacity-60 grayscale' : ''}`;

        card.innerHTML = `
            ${isOutOfStock ? '<div class="absolute inset-0 bg-white/50 backdrop-blur-[1px] z-10 hidden"></div><div class="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full z-20">Out of Stock</div>' : ''}
            <div>
                <span class="text-xs text-brand-600 font-semibold uppercase tracking-wider block mb-1">${p.category}</span>
                <h3 class="font-bold text-gray-800 leading-tight truncate-multiline" title="${p.name}">${p.name}</h3>
            </div>
            <div class="flex justify-between items-end mt-2">
                <span class="text-xs text-gray-500 font-medium">${p.stockQuantity} ${p.unit} left</span>
                <span class="font-bold text-lg text-brand-600">Rs.${p.sellingPrice.toFixed(2)}</span>
            </div>
        `;

        if (!isOutOfStock) {
            card.addEventListener('click', () => addToCart(p));
        }

        container.appendChild(card);
    });
}

function addToCart(product) {
    const existing = currentCart.find(item => item.product.id === product.id);

    if (existing) {
        // Validation for stock limit
        if (existing.qty >= product.stockQuantity) {
            showToast('Cannot exceed available stock', 'error');
            return;
        }
        existing.qty += 1;
    } else {
        currentCart.push({
            product: product,
            qty: 1
        });
    }

    updateCartUI();
}

function updateCartUI() {
    const container = document.getElementById('cart-items');
    let emptyMsg = document.getElementById('empty-cart-msg');

    if (!emptyMsg) {
        emptyMsg = document.createElement('div');
        emptyMsg.id = 'empty-cart-msg';
        emptyMsg.className = 'text-center text-gray-400 mt-10';
        emptyMsg.innerHTML = '<i class="fas fa-cart-arrow-down text-4xl mb-4 text-gray-300"></i><p>Cart is empty</p>';
        container.appendChild(emptyMsg);
    }

    const checkoutBtn = document.getElementById('checkout-btn');
    const badge = document.getElementById('mobile-cart-badge');

    Array.from(container.children).forEach(child => {
        if (child.id !== 'empty-cart-msg') {
            child.remove();
        }
    });

    if (currentCart.length === 0) {
        emptyMsg.style.display = 'block';
        checkoutBtn.disabled = true;
        badge.innerText = '0';
        badge.style.display = 'none';
        calculateTotals();
        return;
    }

    emptyMsg.style.display = 'none';
    checkoutBtn.disabled = false;

    let totalItems = 0;

    currentCart.forEach((item, index) => {
        totalItems += item.qty;
        const itemEl = document.createElement('div');
        itemEl.className = 'bg-gray-50 p-3 rounded-xl border border-gray-100 flex flex-col gap-2 cart-item-row';

        const isMeter = (item.product.unit || 'Pieces').toLowerCase().includes('meter');
        const step = isMeter ? "0.1" : "1";

        itemEl.innerHTML = `
            <div class="flex justify-between items-start">
                <h4 class="font-bold text-gray-800 text-sm max-w-[70%]">${item.product.name}</h4>
                <button onclick="removeFromCart(${index})" class="text-gray-400 hover:text-red-500 transition-colors">
                    <i class="fas fa-times-circle"></i>
                </button>
            </div>
            <div class="flex justify-between items-center text-sm">
                <div class="flex items-center text-brand-600 font-medium">Rs. ${(item.product.sellingPrice * item.qty).toFixed(2)}</div>
                <div class="flex items-center bg-white border border-gray-200 rounded-lg overflow-hidden h-8">
                    <button onclick="changeQty(${index}, -1)" class="w-8 h-full bg-gray-50 hover:bg-gray-200 text-gray-600 flex items-center justify-center border-r border-gray-200">-</button>
                    <input type="number" step="${step}" min="0.1" max="${item.product.stockQuantity}" value="${item.qty}" class="w-12 h-full text-center outline-none text-sm font-semibold text-gray-800 qty-input" data-index="${index}">
                    <button onclick="changeQty(${index}, 1)" class="w-8 h-full bg-gray-50 hover:bg-gray-200 text-brand-600 flex items-center justify-center border-l border-gray-200">+</button>
                </div>
            </div>
        `;
        container.appendChild(itemEl);
    });

    badge.innerText = totalItems;
    badge.style.display = 'flex';

    // Add listeners to input changes
    document.querySelectorAll('.qty-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-index'));
            let newQty = parseFloat(e.target.value);
            const stock = currentCart[idx].product.stockQuantity;

            if (isNaN(newQty) || newQty <= 0) newQty = 1;
            if (newQty > stock) {
                showToast(`Only ${stock} available`, 'error');
                newQty = stock;
            }

            currentCart[idx].qty = newQty;
            updateCartUI();
        });
    });

    calculateTotals();
}

function removeFromCart(index) {
    currentCart.splice(index, 1);
    updateCartUI();
}

function changeQty(index, delta) {
    const item = currentCart[index];
    const unitStr = item.product.unit || 'Pieces';
    const isMeter = unitStr.toLowerCase().includes('meter');
    const increment = isMeter ? (delta * 0.5) : delta; // Meters change by 0.5 by default via buttons, pieces by 1

    let newQty = item.qty + increment;

    if (newQty <= 0) {
        removeFromCart(index);
        return;
    }

    if (newQty > item.product.stockQuantity) {
        showToast(`Only ${item.product.stockQuantity} available in stock`, 'error');
        return;
    }

    item.qty = parseFloat(newQty.toFixed(2));
    updateCartUI();
}

function calculateTotals() {
    let subtotal = 0;
    currentCart.forEach(item => {
        subtotal += (item.product.sellingPrice * item.qty);
    });

    const discountType = document.getElementById('discount-type').value;
    const discountVal = parseFloat(document.getElementById('discount-value').value) || 0;

    let discountAmount = 0;
    if (discountType === 'flat') {
        discountAmount = discountVal;
    } else {
        discountAmount = subtotal * (discountVal / 100);
    }

    let total = subtotal - discountAmount;
    if (total < 0) total = 0;

    document.getElementById('cart-subtotal').innerText = `Rs. ${subtotal.toFixed(2)}`;
    document.getElementById('cart-total').innerText = `Rs. ${total.toFixed(2)}`;

    return { subtotal, discountAmount, total };
}

document.getElementById('discount-value').addEventListener('input', calculateTotals);
document.getElementById('discount-type').addEventListener('change', calculateTotals);

// Checkout Process
document.getElementById('checkout-btn').addEventListener('click', async () => {
    if (currentCart.length === 0) return;

    try {
        const { total, discountAmount } = calculateTotals();

        // 1. Prepare sale record
        const saleRecord = {
            timestamp: new Date().toISOString(),
            totalAmount: total,
            discount: discountAmount,
            itemsOrdered: currentCart.map(i => ({
                productId: i.product.id,
                name: i.product.name,
                unit: i.product.unit,
                costPrice: i.product.costPrice,
                sellingPrice: i.product.sellingPrice,
                qty: i.qty
            }))
        };

        // 2. Save sale
        await db.sales.add(saleRecord);

        // 3. Update stock levels
        for (const item of currentCart) {
            const product = await db.products.get(item.product.id);
            const newStock = product.stockQuantity - item.qty;
            await db.products.update(item.product.id, { stockQuantity: newStock });
        }

        // 4. Print Receipt
        printReceipt(saleRecord);

        // 5. Cleanup
        currentCart = [];
        document.getElementById('discount-value').value = "0";
        updateCartUI();
        loadPOSProducts(); // Refresh stock in UI
        showToast('Sale completed successfully!', 'success');

    } catch (err) {
        console.error(err);
        showToast('Error processing checkout', 'error');
    }
});


function printReceipt(sale) {
    const d = new Date(sale.timestamp);
    document.getElementById('r-date').innerText = d.toLocaleString();
    document.getElementById('r-inv').innerText = `#${Date.now().toString().slice(-6)}`;

    const tbody = document.getElementById('r-items');
    tbody.innerHTML = '';

    let subtotal = sale.totalAmount + sale.discount;

    sale.itemsOrdered.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="py-1 align-top pr-2 text-[11px] leading-tight break-all">${item.name}</td>
            <td class="py-1 align-top text-center text-xs whitespace-nowrap">${item.qty}</td>
            <td class="py-1 align-top text-right text-xs whitespace-nowrap">${(item.sellingPrice * item.qty).toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });

    if (sale.discount > 0) {
        document.getElementById('r-discount-row').style.display = 'flex';
        document.getElementById('r-discount').innerText = `- ${sale.discount.toFixed(2)}`;
    } else {
        document.getElementById('r-discount-row').style.display = 'none';
    }

    document.getElementById('r-total').innerText = sale.totalAmount.toFixed(2);

    window.print();
}

// ==========================================
// 5. DASHBOARD & ANALYTICS LOGIC
// ==========================================

async function loadDashboard() {
    const products = await db.products.toArray();
    const sales = await db.sales.toArray();
    const returnRecords = await db.returns.toArray();

    // Low Stock Table
    const lowStockBody = document.getElementById('low-stock-table-body');
    const lowStockItems = products.filter(p => p.stockQuantity < 5);

    document.getElementById('stat-low-stock').innerText = lowStockItems.length;

    lowStockBody.innerHTML = '';
    if (lowStockItems.length === 0) {
        lowStockBody.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center text-gray-400">All stock levels are good!</td></tr>';
    } else {
        lowStockItems.slice(0, 5).forEach(p => {
            lowStockBody.innerHTML += `
                <tr>
                    <td class="px-6 py-3 font-medium text-gray-800">${p.name}</td>
                    <td class="px-6 py-3 text-gray-500">${p.category}</td>
                    <td class="px-6 py-3 text-right text-red-600 font-bold">${p.stockQuantity} ${p.unit}</td>
                </tr>
            `;
        });
    }

    // Today's Sales Calculation
    const today = new Date().setHours(0, 0, 0, 0);
    const todaysSales = sales.filter(s => new Date(s.timestamp) >= today);
    const todaysReturns = returnRecords.filter(r => new Date(r.timestamp) >= today);

    let totalSales = 0;
    let netProfit = 0;

    todaysSales.forEach(sale => {
        totalSales += sale.totalAmount;

        sale.itemsOrdered.forEach(item => {
            // Profit = (Sell Price - Cost Price) * qty
            // Discount logic distributed evenly or subtracted from total profit. Here we subtract discount from total profit.
            const cost = item.costPrice || 0;
            const profitPerItem = (item.sellingPrice - cost) * item.qty;
            netProfit += profitPerItem;
        });

        netProfit -= sale.discount; // subtract discount given from final profit
    });

    // Deduct Returns from Sales & Profit
    todaysReturns.forEach(r => {
        totalSales -= r.refundAmount; // subtract revenue loss
        const returnProfitLoss = r.refundAmount - (r.costPrice * r.qty);
        netProfit -= returnProfitLoss; // subtract profit loss
    });

    document.getElementById('stat-sales').innerText = `Rs. ${totalSales.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

    const profitEl = document.getElementById('stat-profit');
    profitEl.innerText = `Rs. ${netProfit.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    if (netProfit < 0) profitEl.classList.add('text-red-500');
    else profitEl.classList.add('text-green-600');

    // Recent Sales Table
    const recentBody = document.getElementById('recent-sales-table-body');
    recentBody.innerHTML = '';

    const recentSales = [...todaysSales].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 5);

    if (recentSales.length === 0) {
        recentBody.innerHTML = '<tr><td colspan="3" class="px-6 py-4 text-center text-gray-400">No sales yet today.</td></tr>';
    } else {
        recentSales.forEach(s => {
            const time = new Date(s.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            const itemCount = s.itemsOrdered.reduce((sum, i) => sum + i.qty, 0);

            recentBody.innerHTML += `
                <tr>
                    <td class="px-6 py-3 text-gray-600">${time}</td>
                    <td class="px-6 py-3 text-gray-600">${itemCount} items</td>
                    <td class="px-6 py-3 text-right font-medium text-brand-600">Rs. ${s.totalAmount.toFixed(2)}</td>
                </tr>
            `;
        });
    }
}

// ==========================================
// 8. BACKUP & EXPORT
// ==========================================
function setupEventListeners() {
    // Export Data
    document.getElementById('export-btn').addEventListener('click', async () => {
        try {
            const products = await db.products.toArray();
            const vendors = await db.vendors.toArray();
            const sales = await db.sales.toArray();
            const returnsData = await db.returns.toArray();

            const backup = {
                timestamp: new Date().toISOString(),
                data: { products, vendors, sales, returns: returnsData }
            };

            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup, null, 2));
            const dlAnchorElem = document.createElement('a');
            dlAnchorElem.setAttribute("href", dataStr);
            dlAnchorElem.setAttribute("download", `dk_pos_backup_${new Date().toISOString().slice(0, 10)}.json`);
            dlAnchorElem.click();

            showToast('Backup downloaded successfully', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to export data', 'error');
        }
    });

    // Import Data
    document.getElementById('import-file').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target.result);

                if (!json.data || !json.data.products) {
                    throw new Error('Invalid backup file format');
                }

                if (confirm('WARNING: Importing data will DELETE all current records. Continue?')) {
                    await db.transaction('rw', db.products, db.vendors, db.sales, db.returns, async () => {
                        await db.products.clear();
                        await db.vendors.clear();
                        await db.sales.clear();
                        if (db.returns) await db.returns.clear();

                        await db.products.bulkAdd(json.data.products);
                        await db.vendors.bulkAdd(json.data.vendors);
                        await db.sales.bulkAdd(json.data.sales);
                        if (json.data.returns && db.returns) await db.returns.bulkAdd(json.data.returns);
                    });

                    showToast('Data imported successfully! Reloading...', 'success');
                    setTimeout(() => location.reload(), 2000);
                }
            } catch (err) {
                console.error(err);
                showToast('Failed to import data: ' + err.message, 'error');
            }
            // clear input
            e.target.value = '';
        };
        reader.readAsText(file);
    });
}

// ==========================================
// 7. RETURNS LOGIC
// ==========================================

async function loadReturns() {
    // 1. Load pieces products to dropdown
    const products = await db.products.toArray();
    const pieceProducts = products.filter(p => (p.unit || 'Pieces').toLowerCase().includes('piece'));
    const select = document.getElementById('return-product-select');
    select.innerHTML = '<option value="">Select a product...</option>';
    pieceProducts.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = `${p.name} (Rs. ${p.sellingPrice.toFixed(2)})`;
        select.appendChild(opt);
    });

    // 2. Load recent returns table
    let returnsTbl = await db.returns.toArray();
    const tbody = document.getElementById('recent-returns-table-body');
    tbody.innerHTML = '';

    // Sort descending by timestamp
    returnsTbl = returnsTbl.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)).slice(0, 10);

    if (returnsTbl.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="px-6 py-4 text-center text-gray-400">No returns recorded yet.</td></tr>';
        return;
    }

    returnsTbl.forEach(r => {
        const d = new Date(r.timestamp);
        const timeStr = `${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

        tbody.innerHTML += `
            <tr>
                <td class="px-6 py-3 text-gray-600 text-xs">${timeStr}</td>
                <td class="px-6 py-3 font-medium text-gray-800">${r.productName}</td>
                <td class="px-6 py-3 text-center font-bold text-red-600">${r.qty}</td>
                <td class="px-6 py-3 text-right font-medium text-brand-600">Rs. ${r.refundAmount.toFixed(2)}</td>
            </tr>
        `;
    });
}

document.getElementById('process-return-btn')?.addEventListener('click', async () => {
    const select = document.getElementById('return-product-select');
    const productId = select.value;
    const qty = parseInt(document.getElementById('return-qty').value);

    if (!productId || isNaN(qty) || qty <= 0) {
        showToast('Please select a valid product and quantity', 'error');
        return;
    }

    try {
        const product = await db.products.get(parseInt(productId));
        if (!product) throw new Error('Product not found');

        const refundAmount = product.sellingPrice * qty;

        const returnRecord = {
            timestamp: new Date().toISOString(),
            productId: product.id,
            productName: product.name,
            qty: qty,
            refundAmount: refundAmount,
            costPrice: product.costPrice || 0
        };

        await db.returns.add(returnRecord);

        // Update stock
        await db.products.update(product.id, { stockQuantity: product.stockQuantity + qty });

        showToast(`Return processed! Stock restored. Refund: Rs. ${refundAmount.toFixed(2)}`, 'success');

        document.getElementById('return-product-select').value = '';
        document.getElementById('return-qty').value = '1';

        loadReturns();
    } catch (err) {
        console.error(err);
        showToast('Error processing return', 'error');
    }
});
