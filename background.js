// Service Worker for GitHub Release Notices Manager
// Opens the extension in a new tab when the toolbar icon is clicked

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('GitHub Release Notices Manager installed.');
  }
});
