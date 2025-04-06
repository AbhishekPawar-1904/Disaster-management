document.addEventListener('DOMContentLoaded', () => {
    initMap();
    updateDisasterRisk();
    setInterval(updateDisasterRisk, 5000);
    Notification.requestPermission();

    const emergencyAlertButton = document.getElementById('emergency-alert');
    if (emergencyAlertButton) {
        emergencyAlertButton.addEventListener('click', sendAlert);
    }

    addTrackMyLocationButton();

    if (document.getElementById('news-feed')) {
        loadNewsUpdates();
    }

    if (document.getElementById('alert-log')) {
        loadAlertLog();
    }

    if (document.getElementById('user-alerts')) {
        loadUserAlerts(); // New function for dashboard
    }

    const notificationContainer = document.createElement('div');
    notificationContainer.id = 'notification-container';
    notificationContainer.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 1000;
        max-width: 300px;
    `;
    document.body.appendChild(notificationContainer);
});

let map;
let markers = [];

function initMap() {
    const mapElement = document.getElementById("disaster-map");
    if (mapElement) {
        map = L.map('disaster-map').setView([20.5937, 78.9629], 5);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        }).addTo(map);
        loadAlerts();
    }
}

function addTrackMyLocationButton() {
    const mapElement = document.getElementById("disaster-map");
    if (mapElement) {
        let trackButton = document.getElementById('track-location');
        if (!trackButton) {
            trackButton = document.createElement('button');
            trackButton.id = 'track-location';
            trackButton.className = 'track-location-button';
            trackButton.innerHTML = 'Track My Location';
            trackButton.addEventListener('click', trackLocation);
            document.body.appendChild(trackButton);
        } else {
            trackButton.addEventListener('click', trackLocation);
        }
    }
}

function trackLocation() {
    if (navigator.geolocation) {
        const trackButton = document.getElementById('track-location');
        const originalText = trackButton.innerHTML;
        trackButton.innerHTML = 'Locating...';
        trackButton.disabled = true;
        
        navigator.geolocation.getCurrentPosition(
            position => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                if (map) {
                    markers.forEach(marker => {
                        if (marker.isUserMarker) {
                            map.removeLayer(marker);
                        }
                    });
                    markers = markers.filter(marker => !marker.isUserMarker);
                    
                    map.setView([lat, lng], 13);
                    const userMarker = L.marker([lat, lng]);
                    userMarker.isUserMarker = true;
                    userMarker.addTo(map)
                        .bindPopup("Your Current Location")
                        .openPopup();
                    markers.push(userMarker);
                    
                    checkNearbyDisasters(lat, lng);
                }
                
                trackButton.innerHTML = originalText;
                trackButton.disabled = false;
                
                showNotification('Location tracked successfully!', 'success');
            },
            error => {
                console.error("Error getting location:", error);
                showNotification('Unable to access your location. Please enable location permissions.', 'error');
                
                trackButton.innerHTML = originalText;
                trackButton.disabled = false;
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    } else {
        showNotification('Geolocation not supported by your browser.', 'error');
    }
}

function checkNearbyDisasters(userLat, userLng) {
    let nearbyFound = false;
    
    markers.forEach(marker => {
        if (!marker.isUserMarker) {
            const markerLatLng = marker.getLatLng();
            const distance = calculateDistance(
                userLat, userLng, 
                markerLatLng.lat, markerLatLng.lng
            );
            
            if (distance < 50) {
                nearbyFound = true;
                showNotification(`Warning: You are near a disaster area (${distance.toFixed(1)}km away)`, 'warning');
            }
        }
    });
    
    if (!nearbyFound) {
        showNotification('No disasters reported in your vicinity.', 'info');
    }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    const distance = R * c; // Distance in km
    return distance;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        padding: 15px 20px;
        margin-bottom: 15px;
        border-radius: 8px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.15);
        animation: slideIn 0.3s forwards;
        position: relative;
        display: flex;
        justify-content: space-between;
        align-items: center;
    `;
    
    switch(type) {
        case 'success':
            notification.style.backgroundColor = '#27ae60';
            notification.style.color = 'white';
            break;
        case 'error':
            notification.style.backgroundColor = '#e74c3c';
            notification.style.color = 'white';
            break;
        case 'warning':
            notification.style.backgroundColor = '#f39c12';
            notification.style.color = 'white';
            break;
        default:
            notification.style.backgroundColor = '#3498db';
            notification.style.color = 'white';
    }
    
    notification.innerHTML = `
        <span>${message}</span>
        <span style="margin-left: 15px; cursor: pointer;" onclick="this.parentElement.remove()">×</span>
    `;
    
    container.appendChild(notification);
    
    setTimeout(() => {
        if (notification.parentNode === container) {
            notification.style.animation = 'slideOut 0.3s forwards';
            setTimeout(() => {
                if (notification.parentNode === container) {
                    container.removeChild(notification);
                }
            }, 300);
        }
    }, 5000);
}

function loadAlerts() {
    fetch('/get_alerts')
        .then(response => response.json())
        .then(alerts => {
            markers.forEach(marker => {
                if (!marker.isUserMarker) {
                    map.removeLayer(marker);
                }
            });
            markers = markers.filter(marker => marker.isUserMarker);
            
            alerts.forEach(alert => {
                const markerIcon = getMarkerIcon(alert.severity);
                const marker = L.marker([alert.latitude, alert.longitude], {icon: markerIcon})
                    .addTo(map)
                    .bindPopup(`
                        <strong>${alert.location}</strong>
                        <p><b>Severity:</b> ${alert.severity}</p>
                        <p>${alert.description}</p>
                    `);
                markers.push(marker);
            });
        })
        .catch(error => {
            console.error('Error fetching alerts:', error);
            showNotification('Failed to load disaster alerts', 'error');
        });
}

function getMarkerIcon(severity) {
    const iconUrl = 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png';
    const shadowUrl = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png';
    
    return L.icon({
        iconUrl: iconUrl,
        shadowUrl: shadowUrl,
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
        className: `marker-${severity.toLowerCase()}`
    });
}

function loadNewsUpdates() {
    const newsFeed = document.getElementById('news-feed');
    if (!newsFeed) return;
    
    fetch('/get_news')
        .then(response => response.json())
        .then(news => {
            if (news.error) {
                throw new Error(news.error);
            }
            
            newsFeed.innerHTML = '';
            
            if (news.length === 0) {
                newsFeed.innerHTML = '<div class="loading">No news updates available</div>';
                return;
            }
            
            news.forEach(item => {
                const date = new Date(item.timestamp);
                const formattedDate = date.toLocaleString();
                
                const newsItem = document.createElement('div');
                newsItem.className = 'news-item';
                newsItem.innerHTML = `
                    <h4>${item.title}</h4>
                    <p>${item.content}</p>
                    <small>${formattedDate}</small>
                `;
                newsFeed.appendChild(newsItem);
            });
        })
        .catch(error => {
            console.error('Error loading news:', error);
            newsFeed.innerHTML = `<div class="loading">Failed to load news updates. ${error.message}</div>`;
        });
}

function loadAlertLog() {
    const alertLog = document.getElementById('alert-log');
    if (!alertLog) return;
    
    fetch('/get_alerts')
        .then(response => response.json())
        .then(alerts => {
            alertLog.innerHTML = '';
            
            if (alerts.length === 0) {
                alertLog.innerHTML = '<li>No alerts available</li>';
                return;
            }
            
            alerts.forEach(alert => {
                const alertItem = document.createElement('li');
                alertItem.className = `alert-${alert.severity.toLowerCase()}`;
                alertItem.innerHTML = `
                    <h4>${alert.location}</h4>
                    <p><strong>Severity:</strong> ${alert.severity}</p>
                    <p>${alert.description}</p>
                `;
                alertLog.appendChild(alertItem);
            });
        })
        .catch(error => {
            console.error('Error loading alerts:', error);
            alertLog.innerHTML = '<li>Failed to load alerts</li>';
        });
}

function loadUserAlerts() {
    const userAlerts = document.getElementById('user-alerts');
    if (!userAlerts) return;
    
    fetch('/get_alerts')
        .then(response => response.json())
        .then(alerts => {
            userAlerts.innerHTML = '';
            
            if (alerts.length === 0) {
                userAlerts.innerHTML = '<li>No recent alerts</li>';
                return;
            }
            
            alerts.forEach(alert => {
                const alertItem = document.createElement('li');
                alertItem.className = `alert-${alert.severity.toLowerCase()}`;
                alertItem.innerHTML = `
                    <h4>${alert.location}</h4>
                    <p><strong>Severity:</strong> ${alert.severity}</p>
                    <p>${alert.description}</p>
                `;
                userAlerts.appendChild(alertItem);
            });
        })
        .catch(error => {
            console.error('Error loading user alerts:', error);
            userAlerts.innerHTML = '<li>Failed to load your alerts</li>';
        });
}

function sendAlert() {
    const location = document.getElementById('alert-location').value;
    const severity = document.getElementById('alert-severity').value;
    const description = document.getElementById('alert-description').value;
    
    if (!location || !severity || !description) {
        showNotification('Please fill in all fields', 'error');
        return;
    }
    
    const latitude = 20.5937 + (Math.random() - 0.5) * 10;
    const longitude = 78.9629 + (Math.random() - 0.5) * 10;
    
    fetch('/send_alert', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            location: location,
            severity: severity,
            description: description,
            latitude: latitude,
            longitude: longitude
        }),
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            throw new Error(data.error);
        }
        
        document.getElementById('alert-location').value = '';
        document.getElementById('alert-description').value = '';
        
        showNotification('Alert sent successfully!', 'success');
        
        loadAlerts();
        if (document.getElementById('alert-log')) {
            loadAlertLog();
        }
    })
    .catch(error => {
        console.error('Error:', error);
        showNotification(`Failed to send alert: ${error.message}`, 'error');
    });
}

function updateDisasterRisk() {
    const riskElement = document.getElementById('disaster-risk');
    if (!riskElement) return;
    
    const risks = ['Low', 'Moderate', 'High', 'Critical'];
    const randomRisk = risks[Math.floor(Math.random() * risks.length)];
    
    riskElement.textContent = randomRisk;
    
    switch (randomRisk) {
        case 'Low':
            riskElement.style.color = '#27ae60';
            break;
        case 'Moderate':
            riskElement.style.color = '#f39c12';
            break;
        case 'High':
            riskElement.style.color = '#e67e22';
            break;
        case 'Critical':
            riskElement.style.color = '#e74c3c';
            break;
    }
}

const socket = io();
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('new_alert', (alert) => {
    console.log('New alert received:', alert);
    showNotification(`New emergency alert: ${alert.location}`, 'warning');
    
    if (map) {
        loadAlerts();
    }
    
    if (document.getElementById('alert-log')) {
        loadAlertLog();
    }
    
    if (document.getElementById('news-feed')) {
        loadNewsUpdates();
    }
    
    if (document.getElementById('user-alerts')) {
        loadUserAlerts();
    }
});