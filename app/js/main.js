$(function() {
  var Color = function (r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  };
  
  Color.prototype.toRGBString = function () {
      return 'rgb('+this.r+','+this.g+','+this.b+')';
  };

  // Color is immutable
  Object.freeze(Color);
  
  var spectrum = [
    {offset: 0, color: new Color(53, 203, 229)}, // #35cbe5 25.5 °C
    {offset: 0.5, color: new Color(64, 203, 156)}, // #40cb9c 33 °C
    {offset: 0.7, color: new Color(124, 202, 87)}, // #7cca57 36 °C
    {offset: 0.8, color: new Color(212, 243, 85)}, // #d4f355 37.5 °C
    {offset: 0.9, color: new Color(254, 152, 4)}, // #fe9804 39 °C
    {offset: 1, color: new Color(223, 51, 65)} // #df3341 40.5 °C
  ];

  var minColorTemp = 25.5; // °C
  var maxColorTemp = 40.5; // °C

  var currentTemp;
  var optimalTemp = 36.5; // °C
  
  var maxEsimate = 7 * 60; // min
  var currentEstimate;
  
  var sampleCountForAvg = 3;
  var sampleCountForEstimate = 3;
  
  var inTempSensorId = "0000068a3594";
  var outTempSensorId = "0000066eff45";
  
  var timeWindow = 'now -2 hour';
  var endpointUrl = 'https://data.sparkfun.com/output/OG62ZDJ65VC3x9jmWbK0.json';

  var chartAnimate = true; // For one time animations

  var lerp = function(a, b, u) {
      return (1-u) * a + u * b;
  };

  var interpolateColor = function(color1, color2, value) {
    var r = parseInt(lerp(color1.r, color2.r, value));
    var g = parseInt(lerp(color1.g, color2.g, value));
    var b = parseInt(lerp(color1.b, color2.b, value));

    return new Color(r, g, b);
  };

  var animateStyleProperty = function(element, property, from, to, duration, callback) {
    var interval = 10;
    var steps = duration/interval;
    var step = 1.0/steps;
    var progress = 0.0;
    
    var animationInterval = setInterval(function() {
      if (progress >= 1.0){ clearInterval(animationInterval) }
      element.style.setProperty(property, callback(from, to, progress));
      progress += step;
    }, interval);
  };

  var getStopColor = function(temp, stopIndex) {
    var tempPosition = (temp - minColorTemp) / (maxColorTemp - minColorTemp) - (stopIndex * 0.2);
    return pickSpectrumHue(tempPosition);
  };

  var pickSpectrumHue = function(value) {
    // Ensure range from 0 to 1
    value = Math.max(Math.min(value, 1), 0);
    
    var prevStop = spectrum.findLastOrDefault(function(obj) {
      return obj.offset <= value;
    }, spectrum[0]);
    
    var nextStop = spectrum.findFirstOrDefault(function(obj) {
      return obj.offset >= value;
    }, spectrum[spectrum.length - 1]);
    
    if (nextStop.offset === prevStop.offset) {
      return prevStop.color;
    } else {
      var colorOffset = (value - prevStop.offset) / (nextStop.offset - prevStop.offset);
      return interpolateColor(prevStop.color, nextStop.color, colorOffset);
    }
  };
  
  var updateCurrentTemp = function(samples) {
    var tempElement = document.getElementById('temperature');
    var avgTemp;
    
    if (samples.length >= sampleCountForAvg) {
      var samplesForAvg = samples.slice(-sampleCountForAvg);
      avgTemp = samplesForAvg.reduce(function(sum, sample) { return sum + sample.temp; }, 0) / sampleCountForAvg;

      if (avgTemp) {
        var gradient = document.getElementById('gradient');
        updateTempGradient(gradient, currentTemp, avgTemp);
        currentTemp = avgTemp;  
      }
    }
    
    tempElement.innerHTML = formatTemperatureHtml(avgTemp);
  }
  
  var updateCurrentEstimate = function(inSamples, outSamples) {
    var timeElement = document.getElementById('estimate');
    var estimateMin;
    
    if (inSamples.length >= sampleCountForEstimate) {
      // Note we flip the x-axis and y-axis for linear regression
      var xSamples = inSamples.map(function(sample) { console.log('sample.time',sample.time); return sample.temp;});
      var ySamples = inSamples.map(function(sample) { return sample.time / 1000 / 60;});

      var lineResult = linearRegression(xSamples, ySamples);
      var estimateMs = lineResult.fn(optimalTemp);

      console.log('estimateMs', estimateMs);
      estimateMin = estimateMs - (Date.now() / 1000 / 60);
    } else {
      estimateMin = maxEsimate;
    }
    
    console.log('time estimate in min ' + estimateMin)
    
    timeElement.innerHTML = formatTimeEstimateHtml(estimateMin);
  }
  
  // http://trentrichardson.com/2010/04/06/compute-linear-regressions-in-javascript/
  function linearRegression(x, y){
    var lr = {};
    var n = y.length;
    var sum_x = 0;
    var sum_y = 0;
    var sum_xy = 0;
    var sum_xx = 0;
    var sum_yy = 0;

    for (var i = 0; i < y.length; i++) {
        sum_x += x[i];
        sum_y += y[i];
        sum_xy += (x[i] * y[i]);
        sum_xx += (x[i] * x[i]);
        sum_yy += (y[i] * y[i]);
    } 

    lr['slope'] = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
    lr['intercept'] = (sum_y - lr.slope * sum_x)/n;
    lr['r2'] = Math.pow((n * sum_xy - sum_x * sum_y) /
              Math.sqrt((n * sum_xx - sum_x * sum_x) *
                        (n * sum_yy - sum_y * sum_y)),2);
    lr['fn'] = function (x) { return this.slope * x + this.intercept; };

    return lr;
  }
  
  var formatTemperatureHtml = function(temp) {
    if (temp) {
      var integer = parseInt(temp); // Get the integer part as is
      var decimal = Math.round(temp % 1 * 10); // Round decimal part to the nearest one digit

      return integer+'<span>.'+decimal+'</span><strong>&deg;</strong>';
    } else {
      return '--';
    }
  }
  
  var formatTimeEstimateHtml = function(minutes) {
    console.log ('minutes', minutes);
    // TODO: move messages 'Paljuun!', 'Pökkyä!' ja 'Poppaa!' to another place
    if (currentTemp > 35.5) {
      return  'Nyt!'
    } else if (minutes) {
      console.log ('minutes2', minutes);
      if (minutes > 60) {
        var hours = minutes / 60.0;
        var integer = parseInt(hours); // Get the integer part as is
        var decimal = Math.round(hours % 1 * 10); // Round decimal part to the nearest one digit

        if (minutes > maxEsimate) {
          return  hours + '<span>h</span>'
        }
        
        console.log ('hours', integer);
        console.log ('dec', decimal);
        return integer + '.' + decimal + '<span>h</span>'
      } else if (minutes > 5) {
        console.log ('actual minutes >5, <= 60', minutes);
        return  parseInt(minutes) + '<span>min</span>'
      } else {
        return '--';
      }
    } else if (minutes > 5) {
      return  '--';
    }
  }
  
  var updateTempGradient = function(gradientElement, fromTemp, toTemp) {
    if(!fromTemp) {
      fromTemp = 0.0;
    }
    var stops = gradientElement.getElementsByTagName('stop');

    for (var i = 0; i < stops.length; i++) {
      var fromColor = getStopColor(fromTemp, i);
      var toColor = getStopColor(toTemp, i);

      animateStyleProperty(stops[i], 'stop-color', fromColor, toColor, 2000, function(from, to, progress) {
        var color = interpolateColor(from, to, progress);
        return color.toRGBString();
      });
    }
  };
  
  var options = {
    showLine: true,
    axisX: {
      labelInterpolationFnc: function(value, index) {
        return index % 10 === 0 ? formatTimeLabel(value) : null;
      }
    },
    axisY: {
      offset: 60,
      labelInterpolationFnc: function(value, index) {
        return formatTempLabel(value);
      }
    }
  };

  var formatTimeLabel = function(value) {
    return moment(value).format('LT'); 
  }

  function formatTempLabel(value) {
    return value.toFixed(1) + '&nbsp;&deg;C';
  }
  
  var responsiveOptions = [
    /*
    ['screen and (min-width: 640px)', {
      axisX: {
        labelInterpolationFnc: function(value, index) {
          return index % 10 === 0 ? getLabel(value) : null;
        }
      },
      axisY: {
        offset: 100,
        labelInterpolationFnc: function(value, index) {
          return value + '&nbsp;&deg;C';
        }
      }
    }]
    */
  ];

  var data = {};
  var chart = null;

  setInterval(function () {
    chartAnimate = false;
    refreshData();
  }, 30000);

  // First render
  refreshData();

  function refreshData() {
    $.get(endpointUrl, { 'gte[timestamp]': timeWindow }, function(samples) {
      if (samples instanceof Array && samples.length >= 4) {
        //samples = samples.filter(function(value, index) {return index % 4 === 0;});
        samples = samples.map(function(sample) {
          return convertSample(sample);
        });
        samples.reverse();
        
        var inSamples = samples.filter(function(sample) {return sample.id === inTempSensorId});
        var outSamples = samples.filter(function(sample) {return sample.id === outTempSensorId});
        
        inSamples = inSamples.filter(function(sample, index) {return index % 2 === 0;});
        outSamples = outSamples.filter(function(sample, index) {return index % 2 === 0;});
        
        console.log('in n ',inSamples.length);
        console.log('out n ',inSamples.length);
        
        updateCurrentTemp(inSamples);
        updateCurrentEstimate(inSamples, outSamples);

        data.labels = inSamples.map(function(sample) {
          return sample.time;
        });

        data.series = [];
        data.series.push(dampenTemps(inSamples));
        data.series.push(dampenTemps(outSamples));

        if (chart == null) {
          initChart();
        } else {
          chart.data = data;
          chart.update();
        }
      }
    }).fail(function() {
      console.error("Referesh failed.");
    });
  }

  var convertSample = function(sample) {
    return {
      id: trimSensorId(sample.id),
      time: new Date(sample.timestamp).getTime(),
      temp: parseFloat(sample.temp)
    };
  }
  
  var dampenTemps = function(samples) {
    console.log(samples[0].temp);
    var previousTemp = samples[0].temp;
    
    return samples.map(function(sample) {
      var delta = sample.temp - previousTemp;

      // Dampen the temperature change, since the sensor data has the tendency to jitter
      return previousTemp + 0.2 * delta;
    });
  }
  
  // Once we don't have extra parenthesis around the id, this will not be needed anymore
  var trimSensorId = function(id) {
    return id.substring(1, id.length - 1);
  }
  
  var toLocalDate = function(milliseconds) {
    var inDate = new Date(milliseconds);
    var localDate = new Date();
    localDate.setTime(inDate.getTime() + 60 * 1000 * localDate.getTimezoneOffset());
    return localDate;
  }

  // Let's put a sequence number aside so we can use it in the event callbacks
  var seq = 0;
  var delays = 80;
  var durations = 500;

  var initChart = function() {
    chart = new Chartist.Line('.ct-chart', data, options, responsiveOptions);

    // Once the chart is fully created we reset the sequence
    chart.on('created', function() {
      seq = 0;
    });

    // On each drawn element by Chartist we use the Chartist.Svg API to trigger SMIL animations
    chart.on('draw', function(data) {

      if (data.type === 'line') {
        data.element.animate({
          opacity: {
            begin: seq * delays + 1000,
            dur: durations,
            from: 0,
            to: 1
          }
        });

        seq++;
      } else if (data.type === 'label' && data.axis === 'x') {
        data.element.animate({
          y: {
            begin: seq * delays,
            dur: durations,
            from: data.y + 100,
            to: data.y,
            // We can specify an easing function from Chartist.Svg.Easing
            easing: 'easeOutQuart'
          }
        });

        seq++;
      } else if (data.type === 'label' && data.axis === 'y') {
        data.element.animate({
          x: {
            begin: seq * delays,
            dur: durations,
            from: data.x - 100,
            to: data.x,
            easing: 'easeOutQuart'
          }
        });

        seq++;
      } else if (chartAnimate && data.type === 'grid') {
        // Using data.axis we get x or y which we can use to construct our animation definition objects
        var pos1Animation = {
          begin: seq * delays,
          dur: durations,
          from: data[data.axis.units.pos + '1'] - 30,
          to: data[data.axis.units.pos + '1'],
          easing: 'easeOutQuart'
        };

        var pos2Animation = {
          begin: seq * delays,
          dur: durations,
          from: data[data.axis.units.pos + '2'] - 100,
          to: data[data.axis.units.pos + '2'],
          easing: 'easeOutQuart'
        };

        var animations = {};
        animations[data.axis.units.pos + '1'] = pos1Animation;
        animations[data.axis.units.pos + '2'] = pos2Animation;
        animations['opacity'] = {
          begin: seq * delays,
          dur: durations,
          from: 0,
          to: 1,
          easing: 'easeOutQuart'
        };

        data.element.animate(animations);

        seq++;
      }
    });
  };
  
  Array.prototype.findFirstOrDefault = function (predicateCallback, defaultValue) {
    for (var i = 0; i < this.length; i++) {
        if (i in this && predicateCallback(this[i])) return this[i];
    }

    return defaultValue;
  };
  
  Array.prototype.findLastOrDefault = function (predicateCallback, defaultValue) {
    for (var i = this.length - 1; i >= 0; i--) {
        if (i in this && predicateCallback(this[i])) return this[i];
    }
    
    return defaultValue;
  };
});