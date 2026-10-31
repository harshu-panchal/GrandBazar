import React from "react";
import { motion } from "framer-motion";
import { CheckCircle, Circle } from "lucide-react";

const VerticalOrderStatusTimeline = ({
  steps = [],
  currentStepPosition = 0,
  completeCurrent = false,
}) => (
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    className="space-y-4"
  >
    {steps.map((step, index) => {
      const isCompleted =
        index < currentStepPosition ||
        (index === currentStepPosition && completeCurrent);
      const isActive = index === currentStepPosition && !completeCurrent;
      const Icon = step.icon || Circle;

      return (
        <div key={step.id} className="relative transition-opacity duration-200">
          <div className="flex items-center gap-4">
            <div
              className={`relative z-10 flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${
                isCompleted
                  ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                  : isActive
                    ? "border-2 border-amber-400 bg-amber-100 text-amber-600"
                    : "bg-slate-100 text-slate-400"
              }`}
            >
              {isCompleted ? (
                <CheckCircle size={24} className="fill-current" />
              ) : isActive ? (
                <div className="animate-spin">
                  <Icon size={22} />
                </div>
              ) : (
                <Circle size={22} />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p
                className={`text-sm font-bold ${
                  isCompleted
                    ? "text-slate-900"
                    : isActive
                      ? "text-amber-700"
                      : "text-slate-400"
                }`}
              >
                {step.label}
              </p>
              {isActive && (
                <p className="mt-0.5 text-xs font-medium text-amber-600">
                  In progress...
                </p>
              )}
            </div>

            {isCompleted && (
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <CheckCircle size={14} className="text-primary" />
              </div>
            )}
          </div>

          {index < steps.length - 1 && (
            <div className="absolute bottom-0 left-6 top-12 -mb-4 w-0.5">
              <div
                className={`h-full w-full ${isCompleted ? "bg-primary" : "bg-slate-200"}`}
              />
            </div>
          )}
        </div>
      );
    })}
  </motion.div>
);

export default VerticalOrderStatusTimeline;

