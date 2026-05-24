import { atom } from "jotai"
import { atomWithStorage } from "jotai/utils"

export type TourStep = "welcome" | "models" | "gateway" | "docs" | "completed"

export const TOUR_STEP_ORDER: TourStep[] = [
  "welcome",
  "models",
  "gateway",
  "docs",
  "completed",
]

export interface TourState {
  currentStep: TourStep
  isActive: boolean
}

const STORAGE_KEY = "picoclaw-tour-state"

const DEFAULT_TOUR_STATE: TourState = {
  currentStep: "welcome",
  isActive: true,
}

export const tourAtom = atomWithStorage<TourState>(
  STORAGE_KEY,
  DEFAULT_TOUR_STATE,
)

export const tourIsActiveAtom = atom(
  (get) => get(tourAtom).isActive,
  (get, set, isActive: boolean) => {
    set(tourAtom, { ...get(tourAtom), isActive })
  },
)

export const tourCurrentStepAtom = atom(
  (get) => get(tourAtom).currentStep,
  (get, set, step: TourStep) => {
    set(tourAtom, { ...get(tourAtom), currentStep: step })
  },
)

export function getNextTourStep(
  currentStep: TourStep,
  isStepAvailable: (step: TourStep) => boolean = () => true,
): TourStep {
  const currentIndex = TOUR_STEP_ORDER.indexOf(currentStep)
  for (let index = currentIndex + 1; index < TOUR_STEP_ORDER.length; index++) {
    const step = TOUR_STEP_ORDER[index]
    if (step === "completed" || isStepAvailable(step)) {
      return step
    }
  }
  return "completed"
}

export function getPrevTourStep(
  currentStep: TourStep,
  isStepAvailable: (step: TourStep) => boolean = () => true,
): TourStep {
  const currentIndex = TOUR_STEP_ORDER.indexOf(currentStep)
  for (let index = currentIndex - 1; index >= 0; index--) {
    const step = TOUR_STEP_ORDER[index]
    if (isStepAvailable(step)) {
      return step
    }
  }
  return currentStep
}

export function useTourActions() {
  const goToNextStep = getNextTourStep
  const goToPrevStep = getPrevTourStep

  return { goToNextStep, goToPrevStep }
}
