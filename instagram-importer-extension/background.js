chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (!msg || msg.type !== 'OPEN_MEETMAP_IMPORT') return
  if (!msg.url) return

  chrome.tabs.create({ url: msg.url })
})

