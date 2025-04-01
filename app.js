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
const POLL_INTERVAL = 10000; // 10 seconds

function pollGoogleSheet() {
  // Create a timestamp to prevent caching
  const timestamp = new Date().getTime();

  // Use the Sheet API with explicit JSON output
  const apiUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:json&sheet=Sheet1&headers=1&_=${timestamp}`;

  fetch(apiUrl)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to fetch spreadsheet data: ${response.status}`);
      }
      return response.text();
    })
    .then((jsonText) => {
      // Log the first 100 characters to debug
      console.log("Response prefix:", jsonText.substring(0, 100));

      try {
        // The response comes with a specific prefix that needs to be removed
        // Format is: "/*O_o*/google.visualization.Query.setResponse({...});"
        // We need to extract just the JSON object between the parentheses

        // Extract the JSON object from the response
        const startMarker = "setResponse(";
        const startIndex = jsonText.indexOf(startMarker);
        if (startIndex === -1) {
          throw new Error("Invalid response format: Missing setResponse marker");
        }

        // Find start of the actual JSON (after the marker)
        const jsonStart = startIndex + startMarker.length;

        // Find the closing parenthesis (end of JSON)
        // We need to account for nested parentheses, so we'll use a simple counter
        let openParens = 1;
        let jsonEnd = jsonStart;

        for (let i = jsonStart; i < jsonText.length; i++) {
          if (jsonText[i] === "(") openParens++;
          if (jsonText[i] === ")") openParens--;

          if (openParens === 0) {
            jsonEnd = i;
            break;
          }
        }

        if (openParens > 0) {
          throw new Error("Invalid response format: Unclosed parentheses");
        }

        // Extract the JSON string
        const jsonString = jsonText.substring(jsonStart, jsonEnd);
        console.log("Extracted JSON data start:", jsonString.substring(0, 50));

        // Parse the extracted JSON
        const data = JSON.parse(jsonString);

        // Check if we have valid data
        if (!data.table || !data.table.rows) {
          throw new Error("Invalid data format received from Google Sheets");
        }

        const sheetData = data.table;
        const rows = sheetData.rows;

        // Process only new rows
        if (rows.length > lastProcessedRow) {
          console.log(`Processing rows ${lastProcessedRow + 1} to ${rows.length}`);

          // Get column indices (first row might be headers)
          const textColumnIndex = 0; // Assuming text is in column A
          const sentimentColumnIndex = 1; // Assuming sentiment is in column B

          // Process new rows only
          for (let i = Math.max(1, lastProcessedRow); i < rows.length; i++) {
            const rowData = rows[i].c;

            // Skip empty rows
            if (!rowData || !rowData[textColumnIndex] || !rowData[textColumnIndex].v === null) {
              continue;
            }

            const text = rowData[textColumnIndex].v.toString().trim();
            let sentiment = "";

            // Get sentiment value if available
            if (rowData[sentimentColumnIndex] && rowData[sentimentColumnIndex].v !== null) {
              sentiment = rowData[sentimentColumnIndex].v.toString().toLowerCase().trim();
            }

            // Skip rows with null sentiment or empty text
            if (sentiment === "null" || !text) {
              continue;
            }

            // Validate sentiment value
            if (!["positive", "negative", "neutral"].includes(sentiment)) {
              sentiment = "neutral"; // Default to neutral if invalid
            }

            // Add new message to dashboard
            const newMessage = {
              id: Date.now() + i,
              text: text,
              sentiment: sentiment,
              createdTime: Date.now(),
            };

            addNewMessage(newMessage);
            console.log(`Added new message: "${text}" (${sentiment})`);
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
      } catch (error) {
        console.error("Error parsing Google Sheets data:", error);
        console.log("Raw response excerpt:", jsonText.substring(0, 200) + "...");
        throw error;
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
