import { searchKaggleDatasets } from './src/app/api/search/services/kaggle/searchDatasets';
import { searchHuggingFaceModels } from './src/app/api/search/services/huggingface/searchModels';

async function main() {
    const spec = {
        title: "Medical Image Classifier",
        subdomain: "healthcare",
        domain: "medical",
        primary_architecture: "resnet",
        data_modality: "images",
        task: "image classification"
    };

    console.log("Searching Kaggle Datasets...");
    const kaggleResults = await searchKaggleDatasets(spec as any);
    console.log(`Found ${kaggleResults.length} Kaggle datasets.`);
    if (kaggleResults.length > 0) {
        console.log(kaggleResults.slice(0, 2));
    } else {
        console.log("No Kaggle results returned. Check if KAGGLE_USERNAME and KAGGLE_KEY are set in environment.");
    }

    console.log("\nSearching Hugging Face Models...");
    const hfResults = await searchHuggingFaceModels(spec as any);
    console.log(`Found ${hfResults.length} Hugging Face models.`);
    if (hfResults.length > 0) {
        console.log(hfResults.slice(0, 2));
    } else {
        console.log("No Hugging Face results returned (or API just returned empty without token).");
    }
}

main().catch(console.error);
