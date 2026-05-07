let svg, simulation, gLinks, gNodes;
let currentNode = null;
let zoom;

//Data Management
let allNodes = new Map();
let allEdges = new Map();
let visibleNodes = new Set();
let hiddenNodesLog = [];
let expansionHistory = [];
const MAX_VISIBLE_NODES = 20;
let nodeDataCache = new Map();
let isLoading = false;

//Configuration
const CONFIG = {
    darkMode: localStorage.getItem('darkMode') === 'true',
    showEdgeLabels: true,
    nodeRadius: 22,
    linkDistance: 120,
    chargeStrength: -200
};

//Initialization
function initSimulation() {
    const container = document.getElementById("graph-container");
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    svg = d3.select("#graph-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height);
    
    zoom = d3.zoom()
        .scaleExtent([0.1, 4])
        .on("zoom", (event) => {
            if (gLinks && gNodes) {
                gLinks.attr("transform", event.transform);
                gNodes.attr("transform", event.transform);
            }
        });
    
    svg.call(zoom);
    
    gLinks = svg.append("g").attr("class", "links");
    gNodes = svg.append("g").attr("class", "nodes");
    
    simulation = d3.forceSimulation()
        .force("link", d3.forceLink().id(d => d.id).distance(CONFIG.linkDistance))
        .force("charge", d3.forceManyBody().strength(CONFIG.chargeStrength))
        .force("center", d3.forceCenter(width/2, height/2))
        .force("collision", d3.forceCollide().radius(CONFIG.nodeRadius + 5));
    
    simulation.alphaDecay(0.02);
    simulation.velocityDecay(0.6);
    
    applyTheme();
}

function applyTheme() {
    if (CONFIG.darkMode) {
        document.body.style.background = "#1a1a2e";
        document.body.style.color = "#eee";
        const container = document.getElementById("graph-container");
        if (container) container.style.background = "#1a1a2e";
        const controls = document.getElementById("controls");
        if (controls) controls.style.background = "#2d2d44";
    } else {
        document.body.style.background = "#eef2f5";
        document.body.style.color = "#333";
        const container = document.getElementById("graph-container");
        if (container) container.style.background = "#f5f8fa";
        const controls = document.getElementById("controls");
        if (controls) controls.style.background = "#ffffff";
    }
}

//Node Management
function ensureNodeExists(nodeId, parentId = null) {
    if (allNodes.has(nodeId)) return allNodes.get(nodeId);
    
    let x, y;
    const container = document.getElementById("graph-container");
    const centerX = container.clientWidth / 2;
    const centerY = container.clientHeight / 2;
    
    if (parentId && allNodes.has(parentId)) {
        const parent = allNodes.get(parentId);
        const angle = Math.random() * Math.PI * 2;
        const radius = 100 + Math.random() * 50;
        x = (parent.x || centerX) + Math.cos(angle) * radius;
        y = (parent.y || centerY) + Math.sin(angle) * radius;
    } else {
        x = centerX + (Math.random() - 0.5) * 100;
        y = centerY + (Math.random() - 0.5) * 100;
    }
    
    const node = { id: nodeId, x: x, y: y, fx: x, fy: y };
    allNodes.set(nodeId, node);
    return node;
}

function addEdge(sourceId, targetId, label = '') {
    const key = [sourceId, targetId].sort().join('|');
    if (!allEdges.has(key)) {
        allEdges.set(key, { source: sourceId, target: targetId, label: label });
        return true;
    }
    return false;
}

function getNeighbors(nodeId) {
    const neighbors = new Set();
    for (const edge of allEdges.values()) {
        if (edge.source === nodeId) neighbors.add(edge.target);
        if (edge.target === nodeId) neighbors.add(edge.source);
    }
    return neighbors;
}

//Core Functionality
async function expandNode(nodeId) {
    if (isLoading) {
        showNotification("⏳ Loading... please wait", "warning");
        return;
    }
    
    console.log(`📖 Expanding: ${nodeId}`);
    isLoading = true;
    
    try {
        if (!nodeDataCache.has(nodeId)) {
            const response = await fetch(`http://127.0.0.1:8000/api/node/${nodeId}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            nodeDataCache.set(nodeId, data);
        }
        
        const data = nodeDataCache.get(nodeId);
        
        ensureNodeExists(nodeId);
        visibleNodes.add(nodeId);
        
        if (data && data.neighbors) {
            for (const neighbor of data.neighbors) {
                ensureNodeExists(neighbor.id, nodeId);
                visibleNodes.add(neighbor.id);
                addEdge(nodeId, neighbor.id, neighbor.label || '');
            }
        }
        
        currentNode = nodeId;
        
        const existingIndex = expansionHistory.indexOf(nodeId);
        if (existingIndex !== -1) expansionHistory.splice(existingIndex, 1);
        expansionHistory.push(nodeId);
        if (expansionHistory.length > 30) expansionHistory.shift();
        
        enforceVisibilityLimit();
        renderGraph();
        updateAllPanels();
        
        setTimeout(() => centerOnNode(nodeId), 100);
        
        console.log(`📊 Visible: ${visibleNodes.size}/${allNodes.size}, Edges: ${allEdges.size}`);
        
    } catch (error) {
        console.error("Error:", error);
        showNotification(`❌ Failed to load "${nodeId}"`, "error");
    } finally {
        isLoading = false;
    }
}

function enforceVisibilityLimit() {
    if (visibleNodes.size <= MAX_VISIBLE_NODES) return;
    
    const accessTime = new Map();
    accessTime.set(currentNode, Date.now());
    
    const neighbors = getNeighbors(currentNode);
    for (const n of neighbors) {
        if (visibleNodes.has(n)) accessTime.set(n, Date.now() - 1000);
    }
    
    for (let i = 0; i < expansionHistory.length; i++) {
        const nodeId = expansionHistory[i];
        if (visibleNodes.has(nodeId) && !accessTime.has(nodeId)) {
            accessTime.set(nodeId, Date.now() - (expansionHistory.length - i) * 5000);
        }
    }
    
    const sorted = Array.from(visibleNodes).sort((a, b) => 
        (accessTime.get(a) || 0) - (accessTime.get(b) || 0)
    );
    
    let toHide = [];
    for (const nodeId of sorted) {
        if (visibleNodes.size - toHide.length <= MAX_VISIBLE_NODES) break;
        if (nodeId === currentNode || neighbors.has(nodeId)) continue;
        toHide.push(nodeId);
    }
    
    for (const nodeId of toHide) {
        visibleNodes.delete(nodeId);
        hiddenNodesLog.unshift({
            id: nodeId,
            time: new Date().toLocaleTimeString(),
            neighbors: getNeighbors(nodeId).size
        });
    }
    
    if (hiddenNodesLog.length > 30) hiddenNodesLog.pop();
    
    if (toHide.length > 0) {
        showNotification(`🗑️ Auto-hid: ${toHide.join(', ')}`, "info");
    }
}

function clearHiddenLog() {
    hiddenNodesLog = [];
    updateHiddenNodesPanel();
    showNotification("🗑️ Hidden nodes log cleared", "info");
}

//UI Panels
function updateAllPanels() {
    updateHistoryPanel();
    updateStats();
    updateHiddenNodesPanel();
}

function updateHistoryPanel() {
    let panel = document.getElementById("historyPanel");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "historyPanel";
        panel.style.cssText = `
            position: absolute; bottom: 20px; left: 20px; z-index: 100;
            background: ${CONFIG.darkMode ? '#2d2d44' : 'white'};
            border-radius: 12px; padding: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: monospace; font-size: 11px;
            min-width: 240px; max-height: 280px;
            overflow-y: auto; border: 1px solid ${CONFIG.darkMode ? '#444' : '#d4dce4'};
        `;
        document.body.appendChild(panel);
    }
    
    if (expansionHistory.length === 0) {
        panel.innerHTML = `<div style="color:#888;">📜 History empty</div>`;
        return;
    }
    
    const items = expansionHistory.slice().reverse().map((nodeId, idx) => {
        const isCurrent = nodeId === currentNode;
        const isVisible = visibleNodes.has(nodeId);
        const neighborCount = getNeighbors(nodeId).size;
        const visibleNeighbors = Array.from(getNeighbors(nodeId)).filter(n => visibleNodes.has(n)).length;
        
        return `
            <div style="margin: 4px 0; cursor: pointer; padding: 6px 8px; border-radius: 6px;
                        background: ${isCurrent ? '#e3f2fd' : 'transparent'};
                        border-left: 3px solid ${isCurrent ? '#2196f3' : 'transparent'};
                        opacity: ${isVisible ? 1 : 0.5};
                        font-size: 11px;"
                 onclick="jumpToNode('${nodeId}')"
                 onmouseover="this.style.backgroundColor='${CONFIG.darkMode ? '#444' : '#f0f0f0'}'"
                 onmouseout="this.style.backgroundColor='${isCurrent ? '#e3f2fd' : 'transparent'}'">
                <div><strong>${expansionHistory.length - idx}. ${nodeId}</strong> ${isCurrent ? '⭐' : ''}</div>
                <div style="font-size: 9px; color: #888;">🔗 ${visibleNeighbors}/${neighborCount}</div>
            </div>
        `;
    }).join('');
    
    panel.innerHTML = `
        <div style="font-weight:bold; margin-bottom:8px;">📜 History (${expansionHistory.length})</div>
        ${items}
        <div style="margin-top:8px; font-size:9px; color:#888; text-align:center;">
            💡 Click any node to expand
        </div>
    `;
}

function updateHiddenNodesPanel() {
    let panel = document.getElementById("hiddenNodesPanel");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "hiddenNodesPanel";
        panel.style.cssText = `
            position: absolute; top: 20px; right: 20px; z-index: 100;
            background: ${CONFIG.darkMode ? '#2d2d44' : '#fff5f5'};
            border-radius: 12px; padding: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: monospace; font-size: 11px;
            min-width: 200px; max-height: 200px;
            overflow-y: auto; border: 1px solid #ffcccc;
        `;
        document.body.appendChild(panel);
    }
    
    if (hiddenNodesLog.length === 0) {
        panel.innerHTML = `<div style="color:#888;">🗑️ No hidden nodes</div>`;
        return;
    }
    
    const items = hiddenNodesLog.slice(0, 10).map(entry => `
        <div style="padding: 3px 0; border-bottom: 1px solid #ffe0e0;">
            <span style="color:#e74c3c;">🗑️</span> <strong>${entry.id}</strong>
            <span style="color:#888;"> (${entry.neighbors} neighbors)</span>
            <div style="font-size: 9px; color:#999;">at ${entry.time}</div>
        </div>
    `).join('');
    
    panel.innerHTML = `
        <div style="font-weight:bold; margin-bottom:6px; color:#e74c3c;">
            🗑️ Hidden (${hiddenNodesLog.length})
            <span style="float:right; cursor:pointer; font-size:14px;" onclick="window.clearHiddenLog?.()">✖️</span>
        </div>
        ${items}
        <div style="margin-top:6px; font-size:9px; color:#888;">
            Auto-hide when > ${MAX_VISIBLE_NODES} visible
        </div>
    `;
}

function updateStats() {
    let panel = document.getElementById("statsPanel");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "statsPanel";
        panel.style.cssText = `
            position: absolute; bottom: 20px; right: 20px; z-index: 100;
            background: ${CONFIG.darkMode ? '#2d2d44' : 'white'};
            border-radius: 12px; padding: 12px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            font-family: monospace; font-size: 11px;
            text-align: right; border: 1px solid ${CONFIG.darkMode ? '#444' : '#d4dce4'};
            min-width: 180px;
        `;
        document.body.appendChild(panel);
    }
    
    const neighborsOfCurrent = currentNode ? getNeighbors(currentNode).size : 0;
    const visibleNeighbors = currentNode ? 
        Array.from(getNeighbors(currentNode)).filter(n => visibleNodes.has(n)).length : 0;
    const percentFull = Math.round((visibleNodes.size / MAX_VISIBLE_NODES) * 100);
    
    panel.innerHTML = `
        <div style="font-weight:bold; margin-bottom:6px;">📊 Stats</div>
        <div>👁️ Visible: ${visibleNodes.size}</div>
        <div>💾 Memory: ${allNodes.size}</div>
        <div>🔗 Edges: ${allEdges.size}</div>
        <div style="margin-top: 4px;">
            <div style="background:#eee; height:4px; border-radius:2px;">
                <div style="background:${percentFull > 80 ? '#e74c3c' : '#3498db'}; width:${percentFull}%; height:100%;"></div>
            </div>
            <div style="font-size:9px;">Limit: ${visibleNodes.size}/${MAX_VISIBLE_NODES}</div>
        </div>
        <hr style="margin: 6px 0;">
        <div>🔵 <strong style="color:#e74c3c;">${currentNode || '—'}</strong></div>
        <div>🔗 ${visibleNeighbors}/${neighborsOfCurrent}</div>
        <div style="font-size:9px; margin-top:6px; color:#888;">✨ Drag to fix position</div>
    `;
}

function centerOnNode(nodeId) {
    const node = allNodes.get(nodeId);
    if (!node) return;
    
    const container = document.getElementById("graph-container");
    const transform = d3.zoomIdentity
        .translate(container.clientWidth / 2 - node.x, container.clientHeight / 2 - node.y)
        .scale(1);
    
    svg.transition().duration(400).call(zoom.transform, transform);
}

function showNotification(msg, type = "info") {
    const colors = {
        success: "#27ae60",
        error: "#e74c3c",
        warning: "#f39c12",
        info: "#3498db"
    };
    
    const notif = document.createElement("div");
    notif.textContent = msg;
    notif.style.cssText = `
        position: fixed; top: 80px; right: 20px; z-index: 1000;
        background: ${colors[type]}; color: white; padding: 10px 16px;
        border-radius: 8px; font-size: 12px;
        animation: fadeOut 3s forwards;
        font-family: monospace;
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        max-width: 350px;
    `;
    document.body.appendChild(notif);
    setTimeout(() => notif.remove(), 3000);
}

//Graph Rendering
function renderGraph() {
    const visibleNodeIds = new Set(visibleNodes);
    const nodeObjects = Array.from(allNodes.values()).filter(n => visibleNodeIds.has(n.id));
    
    const edgeObjects = [];
    for (const edge of allEdges.values()) {
        if (visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)) {
            const sourceNode = allNodes.get(edge.source);
            const targetNode = allNodes.get(edge.target);
            if (sourceNode && targetNode) {
                edgeObjects.push({
                    source: sourceNode,
                    target: targetNode,
                    label: edge.label
                });
            }
        }
    }
    
    const linkSelection = gLinks.selectAll(".link")
        .data(edgeObjects, d => `${d.source.id}|${d.target.id}`);
    linkSelection.exit().remove();
    
    const linkEnter = linkSelection.enter().append("g").attr("class", "link");
    linkEnter.append("line")
        .attr("stroke", CONFIG.darkMode ? "#666" : "#aaa")
        .attr("stroke-width", 1.5)
        .attr("stroke-opacity", 0.6);
    
    if (CONFIG.showEdgeLabels) {
        linkEnter.append("text")
            .attr("class", "link-label")
            .attr("dy", -6)
            .attr("text-anchor", "middle")
            .attr("fill", CONFIG.darkMode ? "#888" : "#666")
            .attr("font-size", "9px")
            .text(d => d.label || '');
    }
    
    const allLinks = linkEnter.merge(linkSelection);
    
    const nodeSelection = gNodes.selectAll(".node")
        .data(nodeObjects, d => d.id);
    nodeSelection.exit().remove();
    
    const nodeEnter = nodeSelection.enter()
        .append("g")
        .attr("class", "node")
        .call(d3.drag()
            .on("start", dragStarted)
            .on("drag", dragged)
            .on("end", dragEnded)
        );
    
    nodeEnter.append("circle")
        .attr("r", CONFIG.nodeRadius)
        .attr("fill", d => d.id === currentNode ? "#e74c3c" : "#3498db")
        .attr("stroke", "#fff")
        .attr("stroke-width", 2.5);
    
    nodeEnter.append("title")
        .text(d => `${d.id}\nNeighbors: ${getNeighbors(d.id).size}\nClick to expand`);
    
    nodeEnter.append("text")
        .text(d => d.id.length > 8 ? d.id.slice(0,6)+".." : d.id)
        .attr("dy", 5)
        .attr("text-anchor", "middle")
        .attr("fill", "white")
        .attr("font-size", "9px")
        .attr("font-weight", "bold");
    
    nodeEnter.on("click", (event, d) => {
        event.stopPropagation();
        expandNode(d.id);
    });
    
    nodeEnter.on("mouseenter", function(event, d) {
        d3.select(this).select("circle").attr("stroke-width", 4);
        
        const tooltip = d3.select("body").append("div")
            .attr("class", "tooltip")
            .style("position", "absolute")
            .style("background", "rgba(0,0,0,0.9)")
            .style("color", "white")
            .style("padding", "6px 10px")
            .style("border-radius", "6px")
            .style("font-size", "11px")
            .style("pointer-events", "none")
            .style("z-index", "1000")
            .style("font-family", "monospace")
            .html(`<strong>${d.id}</strong><br>
                   🔗 ${getNeighbors(d.id).size} neighbors<br>
                   🖱️ Click to expand`);
        
        tooltip.style("left", (event.pageX + 15) + "px")
               .style("top", (event.pageY - 10) + "px");
    }).on("mouseleave", function() {
        d3.select(this).select("circle").attr("stroke-width", 2.5);
        d3.selectAll(".tooltip").remove();
    });
    
    const allNodesElem = nodeEnter.merge(nodeSelection);
    
    simulation.nodes(nodeObjects);
    simulation.force("link").links(edgeObjects);
    
    nodeObjects.forEach(node => {
        if (node.fx !== undefined && node.fx !== null) {
            node.x = node.fx;
            node.y = node.fy;
        }
    });
    
    simulation.alpha(0.3).restart();
    
    simulation.on("tick", () => {
        allLinks.select("line")
            .attr("x1", d => d.source.x)
            .attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x)
            .attr("y2", d => d.target.y);
        
        if (CONFIG.showEdgeLabels) {
            allLinks.select("text")
                .attr("x", d => (d.source.x + d.target.x) / 2)
                .attr("y", d => (d.source.y + d.target.y) / 2);
        }
        
        allNodesElem.attr("transform", d => `translate(${d.x},${d.y})`);
    });
    
    setTimeout(() => {
        if (simulation.alpha() < 0.05) simulation.stop();
    }, 2000);
}

//Drag Handlers
function dragStarted(event, d) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    d.fx = d.x;
    d.fy = d.y;
}

function dragged(event, d) {
    d.fx = event.x;
    d.fy = event.y;
    d.x = event.x;
    d.y = event.y;
}

function dragEnded(event, d) {
    if (!event.active) simulation.alphaTarget(0);
}

//Reset
function resetGraph() {
    allNodes.clear();
    allEdges.clear();
    visibleNodes.clear();
    expansionHistory = [];
    hiddenNodesLog = [];
    currentNode = null;
    nodeDataCache.clear();
    isLoading = false;
    
    gLinks.selectAll("*").remove();
    gNodes.selectAll("*").remove();
    
    simulation.nodes([]);
    simulation.force("link").links([]);
    simulation.alpha(0);
    simulation.stop();
    
    updateAllPanels();
    
    const container = document.getElementById("graph-container");
    const transform = d3.zoomIdentity.translate(container.clientWidth / 2, container.clientHeight / 2);
    svg.transition().duration(400).call(zoom.transform, transform);
    
    document.getElementById("nodeId").value = "k1";
    document.getElementById("nodeId").focus();
    showNotification("🔄 Graph reset. Enter k1 to start", "success");
}

//Search
function searchAndExpand() {
    const id = document.getElementById("nodeId").value.trim();
    if (id) expandNode(id);
    else showNotification("❌ Enter a node ID", "warning");
}

//Export
function exportGraph() {
    const exportData = {
        metadata: {
            exportDate: new Date().toISOString(),
            totalNodes: allNodes.size,
            totalEdges: allEdges.size,
            visibleNodes: visibleNodes.size,
            currentNode: currentNode
        },
        nodes: Array.from(allNodes.values()).map(n => ({ 
            id: n.id, 
            x: n.x, 
            y: n.y,
            fixed: n.fx !== null
        })),
        edges: Array.from(allEdges.values()),
        visibleNodes: Array.from(visibleNodes),
        history: expansionHistory,
        hiddenLog: hiddenNodesLog
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `graph_export_${new Date().toISOString().slice(0,19)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification("📁 Граф экспортирован в JSON", "success");
}

//Setup
function setupEventHandlers() {
    document.getElementById("searchBtn").onclick = searchAndExpand;
    document.getElementById("resetBtn").onclick = resetGraph;
    document.getElementById("nodeId").onkeypress = e => {
        if (e.key === "Enter") searchAndExpand();
    };
    
    const exportBtn = document.getElementById("exportBtn");
    if (exportBtn) exportBtn.onclick = exportGraph;
    
    const themeBtn = document.getElementById("themeBtn");
    if (themeBtn) themeBtn.onclick = () => {
        CONFIG.darkMode = !CONFIG.darkMode;
        localStorage.setItem('darkMode', CONFIG.darkMode);
        applyTheme();
        renderGraph();
        updateAllPanels();
        themeBtn.textContent = CONFIG.darkMode ? "☀️ Светлая" : "🌙 Тёмная";
        showNotification(`${CONFIG.darkMode ? "Тёмная" : "Светлая"} тема`, "info");
    };
    
    const clearHiddenBtn = document.getElementById("clearHiddenBtn");
    if (clearHiddenBtn) clearHiddenBtn.onclick = () => {
        hiddenNodesLog = [];
        updateHiddenNodesPanel();
        showNotification("🗑️ Лог скрытых узлов очищен", "success");
    };
}

function handleResize() {
    const container = document.getElementById("graph-container");
    svg.attr("width", container.clientWidth).attr("height", container.clientHeight);
    simulation.force("center", d3.forceCenter(container.clientWidth / 2, container.clientHeight / 2));
    simulation.alpha(0.2).restart();
}

//Styles
const style = document.createElement('style');
style.textContent = `
    @keyframes fadeOut {
        0% { opacity: 1; transform: translateX(0); }
        100% { opacity: 0; transform: translateX(20px); }
    }
    
    .node { cursor: pointer; }
    .node:hover circle { filter: brightness(1.1); }
    .link line { transition: stroke-opacity 0.2s; }
    .link:hover line { stroke-opacity: 1; stroke-width: 2px; }
    .link-label { pointer-events: none; }
    
    button {
        background: #3498db; color: white; border: none;
        padding: 6px 12px; border-radius: 6px; cursor: pointer;
        font-size: 12px; font-family: monospace;
        transition: background 0.2s;
    }
    button:hover { background: #2980b9; }
    
    #graph-container { 
        width: 100%; height: calc(100vh - 60px); 
    }
`;
document.head.appendChild(style);

//Start
window.jumpToNode = expandNode;
window.clearHiddenLog = clearHiddenLog;

window.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 Graph Explorer Final Version");
    console.log(`   📊 Max visible: ${MAX_VISIBLE_NODES}`);
    console.log("   🖱️ Click node to expand");
    console.log("   ✨ Drag to fix position");
    console.log("   🌙 Dark mode available");
    console.log("   🔒 Current node and neighbors are NEVER hidden");
    
    initSimulation();
    setupEventHandlers();
    updateAllPanels();
    document.getElementById("nodeId").focus();
    window.addEventListener('resize', handleResize);
});