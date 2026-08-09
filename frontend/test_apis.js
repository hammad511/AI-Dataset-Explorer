const testApis = async () => {
    console.log("Testing Gemini API...");
    try {
        const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=YOUR_GEMINI_KEY_HERE", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts: [{ text: "Hello, recommend datasets for brain tumors." }] }] })
        });
        console.log("Gemini status:", geminiRes.status);
    } catch (e) { console.error("Gemini failed", e); }

    console.log("Testing Hugging Face API...");
    try {
        const hfRes = await fetch("https://huggingface.co/api/datasets?search=brain&limit=1", {
            headers: { "Authorization": "Bearer YOUR_HF_TOKEN_HERE" }
        });
        console.log("HF status:", hfRes.status);
    } catch (e) { console.error("HF failed", e); }

    console.log("Testing Kaggle API...");
    try {
        const auth = Buffer.from("username:KGAT_8aa4f2acfd7562e9f9a239ecabc91eb4").toString('base64');
        const cagRes = await fetch("https://www.kaggle.com/api/v1/datasets/list?search=brain", {
            headers: { "Authorization": `Bearer KGAT_8aa4f2acfd7562e9f9a239ecabc91eb4` }
        });
        console.log("Kaggle Bearer status:", cagRes.status);

        // Also just try basic auth
        const cagRes2 = await fetch("https://www.kaggle.com/api/v1/datasets/list?search=brain", {
            headers: { "Authorization": `Basic ${Buffer.from('dummy:KGAT_8aa4f2acfd7562e9f9a239ecabc91eb4').toString('base64')}` }
        });
        console.log("Kaggle Basic status:", cagRes2.status);
    } catch (e) { console.error("Kaggle failed", e); }
};

testApis();
