import os
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForObjectDetection, pipeline

# Configuration settings
input_dir = 'input'
output_dir = 'output'
confidence_threshold = 0.25

# 1. Create the output directory if it doesn't exist
os.makedirs(output_dir, exist_ok=True)

# 2. Explicitly load processor and model to avoid class-mapping errors
model_id = "mdefrance/yolos-base-signature-detection"
print("Loading signature detection model and processor...")

image_processor = AutoImageProcessor.from_pretrained(model_id)
model = AutoModelForObjectDetection.from_pretrained(model_id)

# Initialize the pipeline with the explicitly loaded components
detector = pipeline(
    task="object-detection", model=model, image_processor=image_processor
)

# Supported image file extensions
valid_extensions = ('.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.webp')

# 3. Check input directory
if not os.path.exists(input_dir):
  print(f"Error: The input directory '{input_dir}' does not exist.")
  exit(1)

image_files = [
    f
    for f in os.listdir(input_dir)
    if f.lower().endswith(valid_extensions)
]

if not image_files:
  print(f"No valid image files found in the '{input_dir}' folder.")
  exit(0)

print(
    f"Found {len(image_files)} image(s). Starting processing with confidence"
    f" threshold {confidence_threshold}..."
)

# 4. Loop through each image in the input folder
for filename in image_files:
  input_path = os.path.join(input_dir, filename)
  base_name, _ = os.path.splitext(filename)

  try:
    image = Image.open(input_path).convert("RGB")
  except Exception as e:
    print(f"Skipping {filename}: Could not open image ({e})")
    continue

  # Run inference with the confidence threshold
  results = detector(image, threshold=confidence_threshold)
  print(f"-> {filename}: Detected {len(results)} signature(s)")

  # Crop and save each detected signature individually
  for i, detection in enumerate(results):
    box = detection["box"]
    score = detection["score"]

    xmin = box["xmin"]
    ymin = box["ymin"]
    xmax = box["xmax"]
    ymax = box["ymax"]

    # Crop the bounding box area from the document image
    signature_crop = image.crop((xmin, ymin, xmax, ymax))

    # Save format: output/originalfilename_sig_1_score_0.89.png
    output_filename = f"{base_name}_sig_{i+1}_score_{score:.2f}.png"
    output_path = os.path.join(output_dir, output_filename)

    signature_crop.save(output_path)
    print(f"     Saved: {output_filename}")

print("\nAll tasks completed! Check the 'output' folder for results.")