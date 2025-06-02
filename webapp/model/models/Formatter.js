// formatter.js
sap.ui.define([], function () {

  "use strict";

  
  return {
    getFiltersAppliedText: function (value) {
      if (value == "null" || value == null || value == undefined) {
       return "No hay resultados.";
      }
      return value ;
    },

    isButtonVisible: function (value) {
      return !!value; // Solo visible si hay valor
    },
    scoreColor: function (score) {
      if (score >= 80) {
        return "scoreGreen";
      } else if (score >= 50) {
        return "scoreOrange";
      } else {
        return "scoreRed";
      }
    },

    scoreText: function (score) {
      return "Score " + score;
    }
  };
});
