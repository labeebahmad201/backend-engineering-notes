document.addEventListener("DOMContentLoaded", () => {
  const firstHeading = document.querySelector("article h1, article h2");
  if (firstHeading) {
    const avatarDiv = document.createElement("div");
    const image_url = window.location.origin + '/backend-engineering-notes/images/labeeb.jpg'
    avatarDiv.style = "display:flex;align-items:center;gap:10px;margin:6px 0 20px 0;";
    avatarDiv.innerHTML = `
      <img src="${image_url}" width="32" height="32" style="border-radius:50%;">
      <span style="font-size:14px;opacity:0.8;">By Labeeb</span>
    `;
    firstHeading.insertAdjacentElement("afterend", avatarDiv);
  }
});
