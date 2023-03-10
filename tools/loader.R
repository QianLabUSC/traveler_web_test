library(R.matlab)
library(rjson)
library(here)

inputFile <- "thri2.mat"
outputFile <- "rhexDataset.json"

setwd("C:/Users/wzy07/Desktop/Traveler_website/tools/current_dataset")

data <- readMat(inputFile)

# Data cleanup

setPrecision <- function(data, precision) {
  if (is.list(data)) {
    return (lapply(data, function(i) { setPrecision(i, precision) }));
  } else {
    return(as.numeric(formatC(data, digits = 4, format = "f")))
  }
}

precision <- 4

moistureData <- data["mm"][1]
moistureData <- lapply(moistureData, function(v) { apply(v, 2, as.list) })
moistureData <- setPrecision(moistureData, precision);
names(moistureData) <- "moisture"

shear0Data <- data["y.H0"][1]
shear0Data <- lapply(shear0Data, function(v) { apply(v, 2, as.list) })
shear0Data <- setPrecision(shear0Data, precision);
names(shear0Data) <- "shear0"

shear1Data <- data["y.H1"][1]
shear1Data <- lapply(shear1Data, function(v) { apply(v, 2, as.list) })
shear1Data <- setPrecision(shear1Data, precision);
names(shear1Data) <- "shear1"

textResult <- toJSON(c(moistureData, shear0Data, shear1Data))

write(paste("export const dataset = ", textResult), "C:/Users/wzy07/Desktop/Traveler_website/src/data/rhexDataset.ts")