import { Message } from './types';
import { callLlm } from './llmProvider';

const SYSTEM_PROMPT = `You are a helpful, intelligent, general-purpose AI assistant for AI Dataset Explorer.
Your job is to understand the user message and provide the most useful, clear, and direct answer possible.
You can answer general questions, educational questions, technical questions, programming questions, AI/ML questions, definitions, writing requests, explanations, and everyday questions.

IMPORTANT BEHAVIOR:
- Answer the user's actual question or statement directly.
- Do not force the conversation into datasets if the user asked a general or conceptual question.
- Respond naturally like a knowledgeable AI assistant.
- Understand short, incomplete, or informal questions.
- For simple questions, give a simple and direct answer.
- For complex questions, provide a clear explanation with structured bullet points or code examples.
- If asked for code, provide correct and practical code snippets.
- If asked for a definition or concept, explain it clearly with an intuitive analogy.
- If the user asks something completely outside of ML/Data (e.g., general science, programming, everyday topics), answer it accurately and politely.

DATASET CONTEXT (if present):
If dataset information is injected into this system prompt as context, use it to accurately answer questions relating to previous search results.`;

/**
 * Intelligent deterministic fallback generator for when LLM APIs are unreachable or unconfigured
 */
function getDeterministicFallbackAnswer(userQuery: string): string {
    const q = userQuery.toLowerCase().trim();

    if (/^(hi|hello|hey|greetings|howdy)\b/i.test(q)) {
        return "Hello! I'm your AI Assistant. I can help answer any questions you have, explain AI concepts, write code, or discover and analyze machine learning datasets & models for your projects. What would you like to explore today?";
    }

    if (/what can you do|who are you|help/i.test(q)) {
        return "I am the AI Dataset & Knowledge Assistant. Here is what I can do:\n\n1. **Answer Any Question**: Explain machine learning concepts, computer science topics, programming, and general questions.\n2. **Dataset Discovery**: Search and rank real datasets from Kaggle & Hugging Face matching your project modality and task.\n3. **Model Matching**: Recommend compatible Hugging Face model architectures.\n4. **Feasibility & Hardware**: Estimate VRAM, training time, and GPU requirements.\n\nFeel free to ask a general question or describe a project (e.g., 'Find CT scan lung cancer datasets')!";
    }

    if (/supervised vs unsupervised/i.test(q)) {
        return "### Supervised vs. Unsupervised Learning\n\n- **Supervised Learning**: The algorithm learns from labeled training data where each input has a corresponding target label (e.g. classification of cats vs dogs, regression of housing prices).\n- **Unsupervised Learning**: The algorithm finds patterns, clusters, or representations in unlabeled data without predefined outputs (e.g. K-Means clustering, PCA, autoencoders).\n- **Semi-Supervised / Self-Supervised**: Combines small labeled datasets with vast unlabeled data (e.g. modern LLMs and vision transformers).";
    }

    if (/backpropagation/i.test(q)) {
        return "### What is Backpropagation?\n\nBackpropagation (backward propagation of errors) is the fundamental algorithm used to train artificial neural networks.\n\n1. **Forward Pass**: Input data passes through network layers to generate a prediction.\n2. **Loss Calculation**: The loss function measures the error between the prediction and the ground truth.\n3. **Backward Pass (Gradients)**: Using the calculus chain rule, the algorithm calculates the partial derivative (gradient) of the loss with respect to each weight.\n4. **Weight Update**: An optimizer (like Adam or SGD) adjusts the weights in the opposite direction of the gradient to minimize error.";
    }

    if (/overfitting/i.test(q)) {
        return "### What is Overfitting and How to Prevent It?\n\nOverfitting occurs when a machine learning model learns the training data too well, including its noise, resulting in poor generalization on unseen test data.\n\n**Common Solutions**:\n1. **Data Augmentation**: Expand training variations (rotations, crops, flips).\n2. **Regularization**: Apply L1/L2 weight decay or Dropout layers.\n3. **Early Stopping**: Stop training when validation loss starts increasing.\n4. **Simpler Architecture**: Reduce the number of layers or parameters.\n5. **Cross-Validation**: Use k-fold cross validation for robust evaluation.";
    }

    if (/reverse a string/i.test(q)) {
        return "Here are common ways to reverse a string:\n\n**Python**:\n```python\ns = 'hello world'\nreversed_s = s[::-1]\nprint(reversed_s)  # 'dlrow olleh'\n```\n\n**JavaScript / TypeScript**:\n```javascript\nconst str = 'hello world';\nconst reversed = str.split('').reverse().join('');\nconsole.log(reversed);\n```";
    }

    return `Here is the information regarding your statement: "${userQuery}":\n\nThis appears to be a general query or concept statement. You can ask me to explain any technical or general concept, write code, or if you are looking for datasets or models, describe your task (for example: *"Coronary artery segmentation CT dataset"* or *"Real-time object detection"*).`;
}

export async function runGeneralAIPipeline(
    messages: Message[],
    context?: any
): Promise<string> {
    const safeMessages = messages
        .slice(-20)
        .map(m => ({
            role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
            content: String(m.content || '').slice(0, 4000),
        }));

    const lastUserMessage = [...safeMessages].reverse().find(m => m.role === 'user')?.content || '';

    let contextualPrompt = SYSTEM_PROMPT;
    if (context) {
        contextualPrompt += `\n\nCONTEXT FROM DATASET SEARCH:\n${JSON.stringify(context, null, 2)}`;
    }

    try {
        const response = await callLlm({
            systemPrompt: contextualPrompt,
            messages: safeMessages,
            temperature: 0.7,
            maxTokens: 1024,
            timeoutMs: 15000,
        });

        const content = response.text?.trim();
        if (content) {
            return content;
        }
    } catch (e: any) {
        console.warn(
            `[GENERAL_AI] Gemini LLM call failed (status=${e?.status ?? 'N/A'}, model=${e?.model ?? 'N/A'}), falling back to deterministic response:`,
            e?.message || e,
            e?.responseBody ? `| Response Body: ${String(e.responseBody).slice(0, 300)}` : ''
        );
    }

    return getDeterministicFallbackAnswer(lastUserMessage);
}
