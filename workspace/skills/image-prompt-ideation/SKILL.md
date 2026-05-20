---
name: image-prompt-ideation
description: Propose creative image-generation prompt concepts or prompt variants from open-ended user direction. Use when the user wants an image idea, a ready-to-use prompt, or style variations for an image generator.
---
# Image Prompt Ideation

Use this skill when the user gives a broad or vague request for an image idea, such as "anything you want," "give me a prompt," or "make variants in different styles."

## What to deliver
Choose the response format that best matches the request:

1. **Concept + ready prompt**
   - Use when the user gives open-ended direction or asks for an idea.
   - Provide:
     - a short concept description in natural language
     - a prompt-ready version the user can paste into an image generator

2. **Prompt variants**
   - Use when the user asks for more versions, alternatives, or different aesthetics.
   - Provide 3 to 5 variants with clear labels.

3. **Concept family**
   - Use when the user wants options.
   - Provide several distinct directions with different moods, settings, or art styles.

## Core workflow

### 1. Interpret the user’s direction
Identify any constraints or preferences from the request:
- subject
- setting
- mood
- time of day
- realism vs illustration
- cultural or regional cues
- color palette
- level of detail
- intended style

If the user gives almost no detail, make a tasteful creative choice and keep it broadly appealing.

### 2. Build a strong base concept
Create one visually coherent scene with:
- a clear subject
- a specific setting
- lighting
- composition cues
- mood
- a style direction
- quality/detail cues

Prefer concrete visuals over abstract wording.

### 3. Convert the concept into prompt form
Write a generator-friendly prompt using concise descriptive phrases. Include, when helpful:
- main subject
- environment
- lighting
- materials or textures
- camera/composition cues
- style or medium
- color treatment
- detail/quality cues

Keep the prompt clean and usable. Avoid unnecessary meta-commentary.

### 4. Offer variants when useful
If the user asks for more, produce style variations of the same base idea. Good variant axes include:
- realistic
- cinematic
- anime
- minimalist
- watercolor
- pixel art
- fantasy
- retro
- futuristic

Keep the scene identity consistent unless the user asks for totally different concepts.

## Response patterns

### Pattern A: open-ended request
Use this when the user says something like "whatever you want."

Output structure:
1. brief lead-in presenting the idea
2. one vivid concept paragraph
3. one prompt-ready block of text
4. optional offer to make more versions

### Pattern B: follow-up variant request
Use this when the user says "yes," "give me 3 versions," or asks for styles.

Output structure:
1. short intro
2. numbered variants
3. each variant should have:
   - style label
   - one prompt-ready line or paragraph

## Style guidance
- Be visually specific.
- Favor scenes that are easy to imagine and render.
- Keep tone friendly and creative.
- Match the user’s language when practical.
- If the user writes in Portuguese, respond in Portuguese unless there is a reason not to.
- Prefer polished prompt wording over technical parameter syntax unless the user asks for model-specific formatting.

## Avoid
- asking too many clarifying questions for casual creative requests
- vague prompts like "beautiful image, high quality" without scene details
- overly long prompts stuffed with redundant adjectives
- unsupported claims about exact model behavior
- copying the same prompt with only one adjective changed

## Example operation

### User gives no strong direction
1. Pick a universally appealing subject, such as a cozy place, striking landscape, or character scene.
2. Add a setting with local texture if appropriate.
3. Add lighting and mood.
4. Add style cues.
5. Produce:
   - a short idea statement
   - a ready prompt
   - an offer for 3 alternate styles

### User asks for variants
1. Preserve the main scene.
2. Re-express it in 3 distinct styles.
3. Label each clearly.
4. Keep each prompt independently usable.

## Source-informed notes for review
Observed successful behavior from validation:
- For a vague request in Portuguese, the assistant proposed a cozy Brazilian street café at sunrise.
- It then turned that concept into a polished prompt.
- On follow-up, it generated three style variants: realistic, anime, and minimalist.
- No existing matched skill cleanly covered this image-prompt ideation pattern, so a new skill is appropriate.