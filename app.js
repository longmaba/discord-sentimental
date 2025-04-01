// --- Utility Functions ---
function showMessage(text) {
  const messageBox = document.getElementById("message-box");
  if (!messageBox) return;
  messageBox.textContent = text;
  messageBox.style.display = "block";
  setTimeout(() => {
    messageBox.style.display = "none";
  }, 3000);
}

// --- Data Storage ---
let allMessages = []; // Start empty
let recentMessages = []; // Start empty
let demoCounter = 1; // Start from 1

// --- Google Sheet Integration ---
let lastProcessedRow = 0;
const SPREADSHEET_ID = "16uwPZ-iJ9eVYFXKqr-ENTWB3tYb-sCmNVPnEmw8Wquw";
const POLL_INTERVAL = 60000; // 10 seconds

function pollGoogleSheet() {
  // Create a timestamp to prevent caching
  const timestamp = new Date().getTime();

  // Use the CSV export URL to access public Google Sheets data
  const apiUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&_=${timestamp}`;

  fetch(apiUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch spreadsheet data: ${response.status}`);
      }
      return response.text();
    })
    .then((csvData) => {
      // Parse CSV data
      const rows = csvData.split("\n").map((row) => row.split(","));

      // Skip header row if it exists
      const startRow = rows[0][0].toLowerCase() === "text" ? 1 : 0;

      // Process only new rows
      if (rows.length > lastProcessedRow) {
        // Loop through new rows
        for (let i = Math.max(startRow, lastProcessedRow); i < rows.length; i++) {
          if (rows[i] && rows[i].length >= 2) {
            const text = rows[i][0].replace(/^"|"$/g, ""); // Remove quotes
            // remove the \r from the sentiment
            let sentiment = (rows[i][1] || "").replace(/\r/g, "").toLowerCase(); // Extract sentiment from column B

            if (sentiment === "null") {
              continue;
            }

            // Add new message to dashboard
            if (text) {
              const newMessage = {
                id: Date.now() + i, // Unique ID
                text: text,
                sentiment: sentiment,
                createdTime: Date.now(),
              };

              addNewMessage(newMessage);
            }
          }
        }

        // Update last processed row
        lastProcessedRow = rows.length;

        // Update message counter
        const counterElement = document.getElementById("message-counter");
        if (counterElement) {
          counterElement.innerHTML = `Storing <span class="font-medium ${recentMessages.length >= 90 ? "text-red-500" : "text-slate-700"}">${
            recentMessages.length
          }</span>/100 messages`;
        }
      }
    })
    .catch((error) => {
      console.error("Error polling Google Sheet:", error);
      showMessage(`Error polling spreadsheet: ${error.message}`);
    })
    .finally(() => {
      // Schedule next poll
      setTimeout(pollGoogleSheet, POLL_INTERVAL);
    });
}

// --- Modified addNewMessage function ---
function addNewMessage(newMessage) {
  // Ensure the message has a timestamp
  if (!newMessage.createdTime) {
    newMessage.createdTime = Date.now();
  }

  // Add to historical data (only store sentiment)
  allMessages.push(newMessage.sentiment);

  // Add to recent messages (store full object)
  recentMessages.push(newMessage);
  if (recentMessages.length > 100) {
    recentMessages.shift();
  }

  processAndDisplayData();
  showMessage(`New ${newMessage.sentiment} message received`);
}

// --- Optimized processAndDisplayData ---
function processAndDisplayData() {
  const totalMessages = allMessages.length;

  // Count sentiments using the optimized array
  const positiveCount = allMessages.filter((s) => s === "positive").length;
  const negativeCount = allMessages.filter((s) => s === "negative").length;
  const neutralCount = totalMessages - positiveCount - negativeCount;

  const positivePercent = totalMessages > 0 ? (positiveCount / totalMessages) * 100 : 0;
  const negativePercent = totalMessages > 0 ? (negativeCount / totalMessages) * 100 : 0;
  const neutralPercent = totalMessages > 0 ? (neutralCount / totalMessages) * 100 : 0;

  // Update UI with statistics from all messages
  document.getElementById("total-messages").textContent = totalMessages;
  document.getElementById("positive-percentage").textContent = `${positivePercent.toFixed(1)}%`;
  document.getElementById("negative-percentage").textContent = `${negativePercent.toFixed(1)}%`;

  // Update chart with statistics from all messages
  requestAnimationFrame(() => {
    renderStackedBar(positivePercent, neutralPercent, negativePercent);
  });

  // Update recent messages list with only last 100
  populateMessageList(recentMessages);
}

// --- Modified initialization ---
document.addEventListener("DOMContentLoaded", () => {
  try {
    renderStackedBar(0, 0, 0);
    processAndDisplayData();
    showMessage("Dashboard loaded. Connecting to Google Sheet...");

    // Start polling the Google Sheet
    pollGoogleSheet();

    // Remove or comment out the demo interval
    /*
    setInterval(() => {
      addNewMessage({
        id: demoCounter,
        text: `Message ${demoCounter} - ${["😊", "😐", "😠"][Math.floor(Math.random() * 3)]}`,
        sentiment: ["positive", "neutral", "negative"][Math.floor(Math.random() * 3)],
        createdTime: Date.now()
      });
      demoCounter++;
    }, 5000);
    */

    // Add reset button handler
    document.getElementById("reset-button").addEventListener("click", resetStatistics);
  } catch (error) {
    console.error("Error initializing dashboard:", error);
    showMessage("Error loading dashboard data.");
    document.getElementById("total-messages").textContent = "Error";
    document.getElementById("positive-percentage").textContent = "Error";
    document.getElementById("negative-percentage").textContent = "Error";
    document.getElementById("message-list").innerHTML = '<p class="text-red-500 p-4">Could not load message data.</p>';
    const barContainer = document.getElementById("stacked-bar");
    if (barContainer) barContainer.innerHTML = '<p class="text-red-500 text-sm p-2">Error loading chart data</p>';
    document.getElementById("legend-positive").textContent = "Err";
    document.getElementById("legend-neutral").textContent = "Err";
    document.getElementById("legend-negative").textContent = "Err";
  }
});

// --- Visualization Functions ---
function renderStackedBar(positivePercent, neutralPercent, negativePercent) {
  const barPositive = document.getElementById("bar-positive");
  const barNeutral = document.getElementById("bar-neutral");
  const barNegative = document.getElementById("bar-negative");
  const legendPositive = document.getElementById("legend-positive");
  const legendNeutral = document.getElementById("legend-neutral");
  const legendNegative = document.getElementById("legend-negative");

  if (!barPositive || !barNeutral || !barNegative || !legendPositive || !legendNeutral || !legendNegative) {
    console.error("Stacked bar chart elements not found.");
    return;
  }

  const totalPercent = positivePercent + neutralPercent + negativePercent;
  let adjPositive = positivePercent;
  let adjNeutral = neutralPercent;
  let adjNegative = negativePercent;

  if (totalPercent > 100) {
    adjPositive = (positivePercent / totalPercent) * 100;
    adjNeutral = (neutralPercent / totalPercent) * 100;
    adjNegative = (negativePercent / totalPercent) * 100;
  }

  barPositive.style.width = `${adjPositive}%`;
  barNeutral.style.width = `${adjNeutral}%`;
  barNegative.style.width = `${adjNegative}%`;

  legendPositive.textContent = `${positivePercent.toFixed(1)}%`;
  legendNeutral.textContent = `${neutralPercent.toFixed(1)}%`;
  legendNegative.textContent = `${negativePercent.toFixed(1)}%`;

  barPositive.textContent = adjPositive > 10 ? `${positivePercent.toFixed(0)}%` : "";
  barNeutral.textContent = adjNeutral > 10 ? `${neutralPercent.toFixed(0)}%` : "";
  barNegative.textContent = adjNegative > 10 ? `${negativePercent.toFixed(0)}%` : "";
}

function populateMessageList(messages) {
  const listElement = document.getElementById("message-list");
  if (!listElement) return;
  listElement.innerHTML = "";

  if (messages.length === 0) {
    listElement.innerHTML = '<p class="text-slate-500 p-4">No messages to display.</p>';
    return;
  }

  // Sort messages by timestamp (newest first) and take latest 20
  const messagesToShow = [...messages].sort((a, b) => (b.createdTime || 0) - (a.createdTime || 0)).slice(0, 20);

  messagesToShow.forEach((msg) => {
    const item = document.createElement("div");
    item.className = "message-list-item";

    let iconClass = "",
      iconColorClass = "",
      textColor = "text-slate-700";
    if (msg.sentiment === "positive") {
      iconClass = "icon-thumbs-up";
      iconColorClass = "text-emerald-500";
    } else if (msg.sentiment === "negative") {
      iconClass = "icon-thumbs-down";
      iconColorClass = "text-red-500";
    } else {
      iconClass = "icon-message-circle";
      iconColorClass = "text-slate-400";
      textColor = "text-slate-600";
    }

    // Format timestamp if available
    const timeDisplay = msg.createdTime ? `<span class="text-xs text-slate-400 ml-2">${new Date(msg.createdTime).toLocaleTimeString()}</span>` : "";

    item.innerHTML = `
      <span class="${iconClass} ${iconColorClass} mt-1"></span>
      <div class="flex-1">
        <p class="${textColor} text-sm">${msg.text}</p>
        ${timeDisplay}
      </div>
    `;
    listElement.appendChild(item);
  });
}

// --- Modified reset function ---
function resetStatistics() {
  if (confirm("Are you sure you want to reset all statistics? This cannot be undone.")) {
    // Reset data stores
    allMessages = [];
    recentMessages = [];
    demoCounter = 1;

    // Update UI
    processAndDisplayData();
    showMessage("All statistics cleared");
  }
}
