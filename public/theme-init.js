(function () {
  try {
    var s = JSON.parse(localStorage.getItem("todolander-settings") || "{}");
    document.documentElement.setAttribute(
      "data-theme",
      s.theme === "dark" ? "dark" : "light",
    );
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();
