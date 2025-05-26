function stringToColor(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 80%)`;
}

function renderForm(categories, feedUrls) {
    const formSections = categories
        .map((cat, idx) => {
            const subInputs = cat.subcategories
                .map(
                    (sub) => `
                <div class="mb-2 flex flex-wrap items-center space-x-2">
                    <input class="border p-1 flex-1" type="text" name="subcategory${idx + 1}Title" value="${sub.title}" placeholder="Title" />
                    <textarea class="border p-1 flex-1" name="subcategory${idx + 1}Desc" placeholder="Description">${sub.description}</textarea>
                    <input class="border p-1 flex-1" type="text" name="subcategory${idx + 1}Keywords" value="${sub.keywords.join(", ")}" placeholder="Keywords" />
                    <button type="button" class="text-red-500 font-bold px-2" onclick="this.parentNode.remove()">&#x2716;</button>
                </div>`
                )
                .join("");
            return `
            <h3 class="text-lg font-semibold">Category ${idx + 1}</h3>
            <input class="border p-1 w-full mb-2" type="text" name="category${idx + 1}" value="${cat.name}" />
            <div id="subcategories${idx + 1}">
                ${subInputs}
            </div>
            <button type="button" class="bg-blue-500 text-white px-2 py-1 rounded mb-2" onclick="addSubcategory(${idx + 1})">Add Subcategory</button>
            <div class="mb-2">
                <label class="block">Category Keywords:</label>
                <input class="border p-1 w-full" type="text" name="catKeywords${idx + 1}" value="${cat.keywords.join(", ")}" />
            </div>
            <div class="mb-4">
                <label class="block">All Keywords:</label>
                <input class="border p-1 w-full" type="text" value="${cat.allKeywords.join(", ")}" readonly />
            </div>
        `;
        })
        .join("");

    const feedInputs = feedUrls
        .map(
            (u) =>
                `<input class="border p-1 w-full mb-2" type="text" name="feed" value="${u}" placeholder="RSS Feed URL" />`,
        )
        .join("");

    return `
        <form method="GET" class="mb-6 space-y-4">
            <h3 class="text-lg font-semibold">RSS Feeds</h3>
            <div id="rssFeeds">
                ${feedInputs}
            </div>
            <button type="button" class="bg-blue-500 text-white px-2 py-1 rounded mb-2" onclick="addFeed()">+ Add Feed</button>
            ${formSections}
            <button type="submit" class="bg-green-600 text-white px-4 py-2 rounded">Load</button>
        </form>
    `;
}

function renderCategorySection(catRes, category, idx) {
    const headerCols = `
        <th class="border px-2 py-1 bg-gray-100">Article</th>
        <th class="border px-2 py-1 bg-gray-100">Similarity</th>
        <th class="border px-2 py-1 bg-gray-100">Keywords</th>
        ${category.subcategories
            .map((sub) => `<th class="border px-2 py-1 bg-gray-100">${sub.title}</th>`)
            .join("")}
    `;
    const rows = catRes
        .map(({ item, similarity, subSimilarities, keywords, composite }) => {
            let img = "";
            if (item["media:content"] && item["media:content"][0].$ && item["media:content"][0].$.url) {
                img = item["media:content"][0].$.url;
            } else if (item.enclosure && item.enclosure[0] && item.enclosure[0].$.url) {
                img = item.enclosure[0].$.url;
            }
            const imgTag = img
                ? `<img src="${img}" alt="" class="max-w-[100px] inline-block align-middle"/>`
                : "";
            const highlightClass = composite > 0.8 ? ' class="bg-green-100"' : "";
            const tags = keywords
                .map(
                    (kw) =>
                        `<span class="tag" style="background-color:${stringToColor(kw)};">${kw}</span>`,
                )
                .join(" ");

            const subCols = subSimilarities
                .map(
                    (sim) =>
                        `<td class="border px-2 py-1${sim >= 0.8 ? " font-bold bg-yellow-100" : ""}">${sim.toFixed(2)}</td>`,
                )
                .join("");
            const simCell = `<td class="border px-2 py-1${similarity >= 0.8 ? " font-bold bg-yellow-100" : ""}">${similarity.toFixed(2)}</td>`;
            return `<tr${highlightClass}><td class="border px-2 py-1">${imgTag} <a href="${item.link[0]}" target="_blank">${item.title[0]}</a></td>${simCell}<td class="border px-2 py-1">${tags}</td>${subCols}</tr>`;
        })
        .join("\n");

    return `
        <h2 class="text-xl font-semibold mb-2">Category ${idx + 1}: ${category.name}</h2>
        <table class="min-w-full border-collapse mb-10">
            <tr>
                ${headerCols}
            </tr>
            ${rows}
        </table>
    `;
}

function renderSections(categoryResults, categories) {
    return categoryResults
        .map((catRes, idx) => renderCategorySection(catRes, categories[idx], idx))
        .join("<br/>");
}

function renderPage(formHtml, sections) {
    return `
        <html>
        <head>
            <title>Business News - Top Matches</title>
            <style>
                .tag { padding: 2px 4px; border-radius: 3px; font-size: 0.8em; margin-left: 4px; display: inline-block; color: #000; }
            </style>
            <script src="https://cdn.tailwindcss.com"></script>
            <script>
                function addSubcategory(idx) {
                    var container = document.getElementById('subcategories' + idx);
                    var div = document.createElement('div');
                    div.className = 'mb-2 flex flex-wrap items-center space-x-2';
                    var title = document.createElement('input');
                    title.type = 'text';
                    title.name = 'subcategory' + idx + 'Title';
                    title.placeholder = 'Title';
                    title.className = 'border p-1 flex-1';
                    div.appendChild(title);
                    var desc = document.createElement('textarea');
                    desc.name = 'subcategory' + idx + 'Desc';
                    desc.placeholder = 'Description';
                    desc.className = 'border p-1 flex-1';
                    div.appendChild(desc);
                    var kw = document.createElement('input');
                    kw.type = 'text';
                    kw.name = 'subcategory' + idx + 'Keywords';
                    kw.placeholder = 'Keywords';
                    kw.className = 'border p-1 flex-1';
                    div.appendChild(kw);
                    var btn = document.createElement('button');
                    btn.type = 'button';
                    btn.innerHTML = '&#x2716;';
                    btn.className = 'text-red-500 font-bold px-2';
                    btn.onclick = function(){ div.remove(); };
                    div.appendChild(btn);
                    container.appendChild(div);
                }
                function addFeed() {
                    var container = document.getElementById('rssFeeds');
                    var input = document.createElement('input');
                    input.type = 'text';
                    input.name = 'feed';
                    input.placeholder = 'RSS Feed URL';
                    input.className = 'border p-1 w-full mb-2';
                    container.appendChild(input);
                }
            </script>
        </head>
        <body class="font-sans p-5">
            ${formHtml}
            ${sections}
        </body>
        </html>
    `;
}

module.exports = {
    renderForm,
    renderSections,
    renderPage,
    stringToColor,
};
